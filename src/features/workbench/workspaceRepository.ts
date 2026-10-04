import { createInitialDocument, type WorkspaceDocument } from '../../shared/models'
import { isValidWorkspaceDocument, repairWorkspaceDocument } from '../../shared/documentRepair'
import { BrowserStorageService, type StorageService } from './storageService'

export interface WorkspaceLoadResult {
  document: WorkspaceDocument
  repaired: boolean
}

export interface WorkspaceRepository {
  load(): Promise<WorkspaceLoadResult | null>
  save(document: WorkspaceDocument): Promise<void>
}

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly storage: StorageService = new BrowserStorageService()) {}

  async load(): Promise<WorkspaceLoadResult | null> {
    try {
      const raw = await this.storage.read()
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      const result = repairWorkspaceDocument(parsed)
      if (!result) return null
      // 发现并修复了坏数据：立即落盘，避免刷新后再次读到损坏的方案。
      if (result.repaired) {
        await this.save(result.document)
      }
      return result
    } catch {
      return null
    }
  }

  async save(document: WorkspaceDocument): Promise<void> {
    // 保存是最后一道防线：结构不合法的数据绝不允许落盘。
    if (!isValidWorkspaceDocument(document)) {
      throw new Error('Refusing to persist an invalid workspace document')
    }
    await this.storage.write(JSON.stringify(document))
  }
}

export function getInitialDocument(document: WorkspaceDocument | null): WorkspaceDocument {
  return document ?? createInitialDocument()
}
