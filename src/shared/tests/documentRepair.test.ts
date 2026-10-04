import { describe, expect, it } from 'vitest'
import { createInitialDocument, createItem, createPlan, type WorkspaceDocument } from '../models'
import { isValidWorkspaceDocument, repairWorkspaceDocument } from '../documentRepair'

describe('document repair on load', () => {
  it('passes through healthy documents untouched', () => {
    const document = createInitialDocument()
    const result = repairWorkspaceDocument(document)
    expect(result?.repaired).toBe(false)
    expect(result?.document).toBe(document)
    expect(isValidWorkspaceDocument(document)).toBe(true)
  })

  it('repairs the cleared-input accident (NaN serialized to null)', () => {
    const document = createInitialDocument()
    const plan = document.plans[0]
    const item = plan.items[0]
    const corrupted: unknown = {
      ...document,
      plans: [{ ...plan, deskWidthMm: null, items: [{ ...item, x: null, y: null, widthMm: null, heightMm: null, rotation: null }] }],
    }
    const result = repairWorkspaceDocument(corrupted)
    expect(result?.repaired).toBe(true)
    const fixed = result!.document.plans[0]
    expect(fixed.deskWidthMm).toBeGreaterThanOrEqual(600)
    const fixedItem = fixed.items[0]
    expect(Number.isFinite(fixedItem.x)).toBe(true)
    expect(Number.isFinite(fixedItem.y)).toBe(true)
    expect(fixedItem.widthMm).toBeGreaterThanOrEqual(40)
    expect(fixedItem.heightMm).toBeGreaterThanOrEqual(40)
    expect(fixedItem.rotation).toBe(0)
    expect(isValidWorkspaceDocument(result!.document)).toBe(true)
  })

  it('repairs extreme values, missing ids, bad types and dangling activePlanId', () => {
    const plan = createPlan('p', false)
    const item = createItem('lamp')
    const corrupted: unknown = {
      version: 1,
      activePlanId: 'gone',
      plans: [{
        ...plan,
        id: '',
        name: '',
        deskWidthMm: 999999,
        deskHeightMm: 1,
        updatedAt: 'not-a-date',
        items: [
          { ...item, id: null as unknown as string, type: 'spaceship' as unknown as typeof item.type, x: 99999, y: -99999, widthMm: 1, heightMm: 9999, rotation: 400 },
          null,
        ],
      }],
    }
    const result = repairWorkspaceDocument(corrupted)
    expect(result?.repaired).toBe(true)
    const fixedPlan = result!.document.plans[0]
    expect(typeof fixedPlan.id).toBe('string')
    expect(fixedPlan.id.length).toBeGreaterThan(0)
    expect(fixedPlan.name).toBe('我的工作台')
    expect(fixedPlan.deskWidthMm).toBe(4000)
    expect(fixedPlan.deskHeightMm).toBe(600)
    expect(fixedPlan.items).toHaveLength(1)
    const fixedItem = fixedPlan.items[0]
    expect(fixedItem.type).toBe('monitor')
    expect(typeof fixedItem.id).toBe('string')
    expect(fixedItem.id.length).toBeGreaterThan(0)
    expect(fixedItem.x).toBe(4000 - fixedItem.widthMm)
    // 深度 2000 大于桌面深度 600：该轴居中（-700），仍保证设备覆盖桌面
    expect(fixedItem.y).toBe(-700)
    expect(fixedItem.widthMm).toBe(40)
    expect(fixedItem.heightMm).toBe(2000)
    expect(fixedItem.rotation).toBe(40)
    expect(result!.document.activePlanId).toBe(fixedPlan.id)
    expect(isValidWorkspaceDocument(result!.document)).toBe(true)
  })

  it('returns null for documents that cannot possibly be a workspace', () => {
    expect(repairWorkspaceDocument(null)).toBeNull()
    expect(repairWorkspaceDocument(undefined)).toBeNull()
    expect(repairWorkspaceDocument('nope')).toBeNull()
    expect(repairWorkspaceDocument({ version: 2, plans: [] })).toBeNull()
    expect(repairWorkspaceDocument({ version: 1, plans: [null] })).toBeNull()
    expect(repairWorkspaceDocument({ version: 1, plans: 'x' })).toBeNull()
  })

  it('repairs a document whose items field was destroyed', () => {
    const plan = createPlan('p', false)
    const corrupted = { version: 1, activePlanId: plan.id, plans: [{ ...plan, items: 'all-gone' }] }
    const result = repairWorkspaceDocument(corrupted as unknown as WorkspaceDocument)
    expect(result?.repaired).toBe(true)
    expect(result!.document.plans[0].items).toEqual([])
    expect(isValidWorkspaceDocument(result!.document)).toBe(true)
  })
})
