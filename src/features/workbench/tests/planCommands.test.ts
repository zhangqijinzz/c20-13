import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import { applyDeskSize, applyItemNumericPatch } from '../planCommands'

describe('plan numeric commands', () => {
  it('rejects a cleared coordinate (NaN) and leaves the plan untouched', () => {
    const plan = createPlan('p', false)
    const item = createItem('monitor')
    const withItem = { ...plan, items: [item] }
    const result = applyItemNumericPatch(withItem, item.id, { x: Number.NaN })
    expect(result).toBe(withItem)
    expect(result.items[0].x).toBe(item.x)
  })

  it('never stores Infinity even when a paste yields it', () => {
    const plan = createPlan('p', false)
    const item = createItem('lamp')
    const withItem = { ...plan, items: [item] }
    const result = applyItemNumericPatch(withItem, item.id, { y: Number.POSITIVE_INFINITY })
    expect(Number.isFinite(result.items[0].y)).toBe(true)
    expect(result.items[0].y).toBe(item.y)
  })

  it('clamps extreme but finite dimension and position values into range', () => {
    const plan = createPlan('p', false)
    const item = createItem('speaker')
    const withItem = { ...plan, items: [item] }
    const result = applyItemNumericPatch(withItem, item.id, { widthMm: 99999, x: -12000 })
    expect(result.items[0].widthMm).toBe(2000)
    expect(result.items[0].x).toBe(-2000)
  })

  it('applies legitimate values unchanged apart from rounding', () => {
    const plan = createPlan('p', false)
    const item = createItem('speaker')
    const withItem = { ...plan, items: [item] }
    const result = applyItemNumericPatch(withItem, item.id, { x: 300, y: 210, widthMm: 160 })
    expect(result.items[0]).toMatchObject({ x: 300, y: 210, widthMm: 160 })
  })

  it('rejects bad desk sizes and clamps extreme ones', () => {
    const plan = createPlan('p', false)
    expect(applyDeskSize(plan, 'deskWidthMm', Number.NaN)).toBe(plan)
    expect(applyDeskSize(plan, 'deskWidthMm', 10).deskWidthMm).toBe(600)
    expect(applyDeskSize(plan, 'deskHeightMm', 9000).deskHeightMm).toBe(4000)
    expect(applyDeskSize(plan, 'deskWidthMm', 1800).deskWidthMm).toBe(1800)
  })
})
