import { describe, expect, it } from 'vitest'
import { LocalWorkspaceRepository } from '../workspaceRepository'
import type { StorageService } from '../storageService'
import { createInitialDocument, createPlan, type WorkspaceDocument } from '../../../shared/models'

function memoryStorage(initial: string | null = null): StorageService {
  let value = initial
  return { read: async () => value, write: async (next) => { value = next } }
}

describe('local workspace repository', () => {
  it('round trips a document', async () => {
    const repository = new LocalWorkspaceRepository(memoryStorage())
    const document = createInitialDocument()
    await repository.save(document)
    const result = await repository.load()
    expect(result.empty).toBe(false)
    expect(result.repaired).toBe(false)
    expect(result.document).toEqual(document)
  })

  it('reports empty storage for first-time use', async () => {
    const repository = new LocalWorkspaceRepository(memoryStorage())
    const result = await repository.load()
    expect(result.empty).toBe(true)
    expect(result.document).toBeNull()
  })

  it('falls back when stored JSON is damaged', async () => {
    const repository = new LocalWorkspaceRepository(memoryStorage('{broken'))
    const result = await repository.load()
    expect(result.document).toBeNull()
    expect(result.empty).toBe(false)
  })

  it('repairs a structurally valid document containing corrupted numbers on load', async () => {
    const plan = createPlan('坏方案', false)
    const broken = {
      version: 1,
      activePlanId: plan.id,
      plans: [{
        ...plan,
        deskWidthMm: null,
        deskHeightMm: 10 ** 9,
        items: [{
          id: 'item-broken',
          type: 'monitor',
          widthMm: 540,
          heightMm: 210,
          x: null,
          y: -999999,
          rotation: null,
        }],
      }],
    } as unknown as WorkspaceDocument

    const storage = memoryStorage(JSON.stringify(broken))
    const repository = new LocalWorkspaceRepository(storage)
    const result = await repository.load()
    expect(result.repaired).toBe(true)
    expect(result.fixCount).toBeGreaterThan(0)
    const repairedPlan = result.document!.plans[0]
    expect(repairedPlan.deskWidthMm).toBe(1600)
    expect(repairedPlan.deskHeightMm).toBe(4000)
    const item = repairedPlan.items[0]
    expect(item.x).toBe(0)
    expect(item.y).toBe(-2000)
    expect(item.rotation).toBe(0)
    expect(Number.isFinite(item.x + item.y + item.widthMm + item.heightMm)).toBe(true)
  })
})
