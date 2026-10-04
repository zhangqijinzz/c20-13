import { describe, expect, it } from 'vitest'
import { repairWorkspaceDocument } from '../documentRepair'
import { inspectPlan } from '../../features/inspection/inspectionViewModel'

describe('reported incident end-to-end', () => {
  it('cleared coordinates persisted as null are repaired: item visible, finite coverage, inspection works', () => {
    // 这正是 bug 版本写进 IndexedDB 的数据形态：NaN 经 JSON 变成 null
    const stored = JSON.stringify({
      version: 1,
      activePlanId: 'plan-1',
      plans: [{
        id: 'plan-1', name: '我的工作台',
        deskWidthMm: 1600, deskHeightMm: 800,
        items: [{ id: 'dev-1', type: 'monitor', widthMm: 540, heightMm: 210, x: null, y: null, rotation: 0 }],
        updatedAt: new Date().toISOString(),
      }],
    })

    const result = repairWorkspaceDocument(JSON.parse(stored))
    expect(result.repaired).toBe(true)
    const plan = result.document!.plans[0]
    const item = plan.items[0]

    // 设备回来：坐标是合法有限数
    expect([item.x, item.y].every(Number.isFinite)).toBe(true)

    // 占用率不再是看不懂的数字
    const inspection = inspectPlan(plan)
    expect(Number.isFinite(inspection.analysis.coveragePercent)).toBe(true)
    expect(inspection.analysis.coveragePercent).toBeGreaterThan(0)

    // 检查功能恢复：该设备在原点附近且在界内 -> 无异常；再测一个真越界的能被报出
    expect(inspection.issueIds).toEqual([])
    item.x = 5000
    expect(inspectPlan(plan).issueIds).toContain('dev-1')
  })
})
