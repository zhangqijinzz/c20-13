import { describe, expect, it } from 'vitest'
import { createItem, createPlan } from '../../../shared/models'
import { moveCanvasItem, rotateCanvasItem } from '../canvasViewModel'

describe('canvas module', () => {
  it('moves and rotates the requested item without changing other items', () => {
    const plan = createPlan('test', false)
    const first = createItem('monitor')
    const second = createItem('keyboard')
    const moved = moveCanvasItem([first, second], first.id, 320, 180, plan.deskWidthMm, plan.deskHeightMm)
    const rotated = rotateCanvasItem(moved, first.id, -15)
    expect(rotated[0]).toMatchObject({ x: 320, y: 180, rotation: 345 })
    expect(rotated[1]).toEqual(second)
  })

  it('clamps drag coordinates so the item always keeps a foothold on the desk', () => {
    const plan = createPlan('test', false)
    const item = createItem('monitor')
    const moved = moveCanvasItem([item], item.id, 5000, 5000, plan.deskWidthMm, plan.deskHeightMm)
    expect(moved[0].x).toBe(plan.deskWidthMm - item.widthMm)
    expect(moved[0].y).toBe(plan.deskHeightMm - item.heightMm)

    const pulledOff = moveCanvasItem([item], item.id, -900, -900, plan.deskWidthMm, plan.deskHeightMm)
    expect(pulledOff[0].x).toBe(0)
    expect(pulledOff[0].y).toBe(0)
  })

  it('rejects NaN and Infinity drag values by keeping the previous position', () => {
    const plan = createPlan('test', false)
    const item = { ...createItem('monitor'), x: 200, y: 200 }
    const nanMoved = moveCanvasItem([item], item.id, Number.NaN, Number.NaN, plan.deskWidthMm, plan.deskHeightMm)
    expect(nanMoved[0].x).toBe(200)
    expect(nanMoved[0].y).toBe(200)
    const infinityMoved = moveCanvasItem([item], item.id, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, plan.deskWidthMm, plan.deskHeightMm)
    expect(infinityMoved[0].x).toBe(200)
    expect(infinityMoved[0].y).toBe(200)
  })
})
