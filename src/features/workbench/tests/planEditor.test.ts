import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import { addItemToPlan, editDeskSize, editItem } from '../planEditor'

describe('plan editor guards', () => {
  it('rejects NaN desk size edits without touching the plan', () => {
    const plan = createPlan('p', false)
    expect(editDeskSize(plan, 'deskWidthMm', Number.NaN)).toBe(plan)
    expect(editDeskSize(plan, 'deskHeightMm', Number.POSITIVE_INFINITY)).toBe(plan)
  })

  it('clamps out-of-range desk sizes visibly', () => {
    const plan = createPlan('p', false)
    expect(editDeskSize(plan, 'deskWidthMm', 100).deskWidthMm).toBe(600)
    expect(editDeskSize(plan, 'deskHeightMm', 9000).deskHeightMm).toBe(4000)
  })

  it('refuses non-finite item values so NaN can never be written', () => {
    const plan = createPlan('p', false)
    const item = createItem('monitor')
    const withItem = addItemToPlan(plan, item)
    const cleared = editItem(withItem, item.id, { x: Number.NaN, y: Number.NaN })
    const target = cleared.items[0]
    expect(Number.isFinite(target.x)).toBe(true)
    expect(Number.isFinite(target.y)).toBe(true)
    expect(target.x).toBe(item.x)
    expect(target.y).toBe(item.y)

    const infinityWidth = editItem(withItem, item.id, { widthMm: Number.POSITIVE_INFINITY })
    expect(infinityWidth.items[0].widthMm).toBe(item.widthMm)
  })

  it('clamps item dimensions and positions into valid ranges', () => {
    const plan = createPlan('p', false)
    const item = createItem('lamp')
    const withItem = addItemToPlan(plan, item)
    const huge = editItem(withItem, item.id, { widthMm: 99999, heightMm: 1 })
    expect(huge.items[0].widthMm).toBe(2000)
    expect(huge.items[0].heightMm).toBe(40)

    const farAway = editItem(withItem, item.id, { x: 5000, y: -5000 })
    const moved = farAway.items[0]
    expect(moved.x).toBe(plan.deskWidthMm - item.widthMm)
    expect(moved.y).toBe(0)
  })

  it('rounds fractional position edits to integers', () => {
    const plan = createPlan('p', false)
    const item = createItem('lamp')
    const withItem = addItemToPlan(plan, item)
    const edited = editItem(withItem, item.id, { x: 100.7, y: 50.2 })
    expect(edited.items[0].x).toBe(101)
    expect(edited.items[0].y).toBe(50)
  })

  it('places newly added items inside the desk', () => {
    const plan = createPlan('p', false)
    const item = { ...createItem('monitor'), x: -9999, y: 9999 }
    const result = addItemToPlan(plan, item)
    const added = result.items[0]
    expect(added.x).toBe(0)
    expect(added.y).toBe(plan.deskHeightMm - item.heightMm)
  })

  it('re-clamps existing item positions when the desk shrinks', () => {
    const plan = createPlan('p', false)
    const item = { ...createItem('lamp'), x: 1200, y: 600 }
    const withItem = addItemToPlan(plan, item)
    const shrunk = editDeskSize(withItem, 'deskWidthMm', 800)
    const moved = shrunk.items[0]
    expect(moved.x).toBe(800 - item.widthMm)
    expect(moved.y).toBe(item.y)
  })
})
