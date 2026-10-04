import { describe, expect, it } from 'vitest'
import { LocalWorkspaceRepository } from '../workspaceRepository'
import type { StorageService } from '../storageService'
import { createInitialDocument } from '../../../shared/models'
import { analyzeLayout } from '../../../shared/layoutRules'
import { editDeskSize, editItem } from '../planEditor'

function memoryStorage(initial: string | null = null): StorageService {
  let value = initial
  return { read: async () => value, write: async (next) => { value = next } }
}

describe('local workspace repository', () => {
  it('round trips a document', async () => {
    const storage = memoryStorage()
    const repository = new LocalWorkspaceRepository(storage)
    const document = createInitialDocument()
    await repository.save(document)
    const loaded = await repository.load()
    expect(loaded?.repaired).toBe(false)
    expect(loaded?.document).toEqual(document)
  })

  it('falls back when stored JSON is damaged', async () => {
    const repository = new LocalWorkspaceRepository(memoryStorage('{broken'))
    await expect(repository.load()).resolves.toBeNull()
  })

  it('repairs a document poisoned by cleared coordinate inputs and persists the fix', async () => {
    // 复现事故：清空输入框后 NaN 经 JSON 落盘变成 null
    const broken = createInitialDocument()
    const corruptedPlan = {
      ...broken.plans[0],
      items: broken.plans[0].items.map((item, index) => (index === 0 ? { ...item, x: null, y: null, widthMm: null } : item)),
      deskWidthMm: null,
    }
    const brokenDocument = { ...broken, plans: [corruptedPlan] }
    const storage = memoryStorage(JSON.stringify(brokenDocument))
    const repository = new LocalWorkspaceRepository(storage)
    const loaded = await repository.load()
    expect(loaded?.repaired).toBe(true)
    const plan = loaded!.document.plans[0]
    expect(plan.deskWidthMm).toBe(1600)
    const repairedItem = plan.items[0]
    expect(Number.isFinite(repairedItem.x)).toBe(true)
    expect(Number.isFinite(repairedItem.y)).toBe(true)
    expect(Number.isFinite(repairedItem.widthMm)).toBe(true)
    expect(repairedItem.widthMm).toBeGreaterThanOrEqual(40)

    // 修复结果已落盘：再次读取不再标记为 repaired
    const reloaded = await repository.load()
    expect(reloaded?.repaired).toBe(false)
    expect(reloaded?.document.plans[0].items[0].x).toBe(repairedItem.x)
  })

  it('clamps extreme values found in storage', async () => {
    const broken = createInitialDocument()
    const plan = broken.plans[0]
    const poisoned = {
      ...broken,
      plans: [{
        ...plan,
        deskWidthMm: 999999,
        deskHeightMm: 5,
        items: plan.items.map((item) => ({ ...item, x: 100000, y: -99999, widthMm: 1, heightMm: 9000 })),
      }],
    }
    const repository = new LocalWorkspaceRepository(memoryStorage(JSON.stringify(poisoned)))
    const loaded = await repository.load()
    expect(loaded?.repaired).toBe(true)
    const fixed = loaded!.document.plans[0]
    expect(fixed.deskWidthMm).toBe(4000)
    expect(fixed.deskHeightMm).toBe(600)
    for (const item of fixed.items) {
      expect(item.widthMm).toBeGreaterThanOrEqual(40)
      expect(item.heightMm).toBeLessThanOrEqual(2000)
      // 修复后的坐标必须有限且让设备仍有一部分处于桌面内（高过桌面的深度轴会居中，可能为负）
      expect(Number.isFinite(item.x)).toBe(true)
      expect(Number.isFinite(item.y)).toBe(true)
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeGreaterThanOrEqual(0 - item.heightMm)
    }
  })

  it('refuses to persist structurally invalid documents', async () => {
    const repository = new LocalWorkspaceRepository(memoryStorage())
    await expect(repository.save({ version: 2 } as never)).rejects.toThrow()
  })

  it('reproduces the reported incident end to end: cleared inputs never corrupt, and broken plans reopen usable', async () => {
    // 1) 模拟事故当天的用户操作：清空 X / Y / 宽度输入框（valueAsNumber 为 NaN），再清空桌面宽度
    let plan = createInitialDocument().plans[0]
    const target = plan.items[0]
    plan = editItem(plan, target.id, { x: Number.NaN, y: Number.NaN, widthMm: Number.NaN })
    plan = editDeskSize(plan, 'deskWidthMm', Number.NaN)
    // 设备仍在、坐标尺寸仍是有限整数
    const stillThere = plan.items.find((item) => item.id === target.id)
    expect(stillThere).toBeDefined()
    expect(Number.isFinite(stillThere!.x) && Number.isFinite(stillThere!.y)).toBe(true)
    expect(Number.isFinite(stillThere!.widthMm)).toBe(true)

    // 2) 模拟旧版本已经写入了坏数据（JSON 里 NaN 为 null）
    const storage = memoryStorage(JSON.stringify({
      version: 1,
      activePlanId: plan.id,
      plans: [{ ...plan, deskWidthMm: null, items: [{ ...stillThere, x: null, y: null }] }],
    }))
    const repository = new LocalWorkspaceRepository(storage)
    const loaded = await repository.load()
    expect(loaded?.repaired).toBe(true)
    const reopened = loaded!.document.plans[0]

    // 3) 修复后：设备可见、占用率是可读数字、检查正常工作
    const analysis = analyzeLayout(reopened)
    expect(Number.isFinite(analysis.coveragePercent)).toBe(true)
    expect(analysis.coveragePercent).toBeGreaterThanOrEqual(0)
    expect(analysis.coveragePercent).toBeLessThanOrEqual(100)
    expect(reopened.items).toHaveLength(1)
    for (const item of reopened.items) {
      expect(Number.isFinite(item.x)).toBe(true)
      expect(Number.isFinite(item.y)).toBe(true)
    }

    // 4) 修复结果已重新落盘，刷新后不再标记异常
    const refreshed = await repository.load()
    expect(refreshed?.repaired).toBe(false)
  })
})
