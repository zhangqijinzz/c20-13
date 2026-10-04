import { describe, expect, it } from 'vitest'
import { repairWorkspaceDocument } from '../documentRepair'
import { createPlan } from '../models'
import { VALUE_LIMITS } from '../layoutRules'

function validItem(overrides: Record<string, unknown> = {}) {
  return { id: 'item-1', type: 'monitor', widthMm: 540, heightMm: 210, x: 100, y: 100, rotation: 0, ...overrides }
}

describe('repairWorkspaceDocument', () => {
  it('returns null for unrecognisable payloads', () => {
    expect(repairWorkspaceDocument(null).document).toBeNull()
    expect(repairWorkspaceDocument('nope').document).toBeNull()
    expect(repairWorkspaceDocument(42).document).toBeNull()
  })

  it('passes through a clean document untouched', () => {
    const plan = createPlan('ok', false)
    const doc = { version: 1, plans: [plan], activePlanId: plan.id }
    const result = repairWorkspaceDocument(doc)
    expect(result.repaired).toBe(false)
    expect(result.document).toEqual(doc)
  })

  it('repairs the exact broken case: cleared coordinates stored as null', async () => {
    // 复现线上故障：清空 X/Y 输入框 -> NaN 被 JSON 序列化成 null
    const plan = createPlan('损坏的方案', true)
    const broken = JSON.parse(JSON.stringify({
      version: 1,
      plans: [{ ...plan, items: [validItem({ x: NaN, y: NaN }), ...[]] }],
      activePlanId: plan.id,
    })) as unknown

    const result = repairWorkspaceDocument(broken)
    expect(result.repaired).toBe(true)
    const repairedItem = result.document!.plans[0].items[0]
    expect(repairedItem.x).toBe(0)
    expect(repairedItem.y).toBe(0)
    expect(Number.isFinite(repairedItem.x)).toBe(true)
  })

  it('clamps extreme desk and item dimensions instead of trusting them', () => {
    const plan = createPlan('extreme', false)
    const broken = {
      version: 1,
      activePlanId: plan.id,
      plans: [{
        ...plan,
        deskWidthMm: 1e9,
        deskHeightMm: 10,
        items: [validItem({ widthMm: 99999, heightMm: -5, x: 12000, y: 0 })],
      }],
    }
    const result = repairWorkspaceDocument(broken)
    const repaired = result.document!.plans[0]
    expect(repaired.deskWidthMm).toBe(VALUE_LIMITS.deskMax)
    expect(repaired.deskHeightMm).toBe(VALUE_LIMITS.deskMin)
    expect(repaired.items[0].widthMm).toBe(VALUE_LIMITS.itemMax)
    expect(repaired.items[0].heightMm).toBe(VALUE_LIMITS.itemMin)
    expect(repaired.items[0].x).toBe(VALUE_LIMITS.positionMax)
  })

  it('drops items with unrecognisable device type but keeps the rest', () => {
    const plan = createPlan('mixed', false)
    const broken = {
      version: 1,
      activePlanId: plan.id,
      plans: [{ ...plan, items: [validItem({ id: 'good' }), validItem({ id: 'bad', type: 'toaster' })] }],
    }
    const result = repairWorkspaceDocument(broken)
    expect(result.repaired).toBe(true)
    expect(result.document!.plans[0].items.map((item) => item.id)).toEqual(['good'])
  })

  it('rebuilds when the plans list is missing or empty', () => {
    const result = repairWorkspaceDocument({ version: 1, plans: [] })
    expect(result.repaired).toBe(true)
    expect(result.document!.plans).toHaveLength(1)
    expect(result.document!.activePlanId).toBe(result.document!.plans[0].id)
  })

  it('repairs an activePlanId that does not point at a real plan', () => {
    const plan = createPlan('ghost', false)
    const result = repairWorkspaceDocument({ version: 1, plans: [plan], activePlanId: 'does-not-exist' })
    expect(result.repaired).toBe(true)
    expect(result.document!.activePlanId).toBe(plan.id)
  })

  it('every repaired number is a finite integer inside the legal range', () => {
    const plan = createPlan('mess', false)
    const broken = {
      version: 1,
      activePlanId: plan.id,
      plans: [{ ...plan, deskWidthMm: Infinity, deskHeightMm: null, items: [validItem({ rotation: 740 })] }],
    }
    const result = repairWorkspaceDocument(JSON.parse(JSON.stringify(broken)))
    const repaired = result.document!.plans[0]
    for (const item of repaired.items) {
      for (const key of ['x', 'y', 'widthMm', 'heightMm', 'rotation'] as const) {
        expect(Number.isFinite(item[key])).toBe(true)
        expect(Number.isInteger(item[key])).toBe(true)
      }
    }
  })
})
