import { createInitialDocument, type WorkspaceDocument } from '../../shared/models'
import { repairWorkspaceDocument, type DocumentRepairResult } from '../../shared/documentRepair'
import { BrowserStorageService, type StorageService } from './storageService'

export interface WorkspaceLoadResult extends DocumentRepairResult {
  /** 存储里什么都没有（首次使用），调用方会创建示例方案 */
  empty: boolean
}

export interface WorkspaceRepository {
  load(): Promise<WorkspaceLoadResult>
  save(document: WorkspaceDocument): Promise<void>
}

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly storage: StorageService = new BrowserStorageService()) {}

  async load(): Promise<WorkspaceLoadResult> {
    let raw: string | null
    try {
      raw = await this.storage.read()
    } catch {
      return { document: null, repaired: false, fixCount: 0, empty: false }
    }
    if (!raw) return { document: null, repaired: false, fixCount: 0, empty: true }

    try {
      const result = repairWorkspaceDocument(JSON.parse(raw) as unknown)
      return { ...result, empty: false }
    } catch {
      // JSON 整体损坏无法解析：交给调用方重建
      return { document: null, repaired: false, fixCount: 0, empty: false }
    }
  }

  async save(document: WorkspaceDocument): Promise<void> {
    await this.storage.write(JSON.stringify(document))
  }
}

export function getInitialDocument(document: WorkspaceDocument | null): WorkspaceDocument {
  return document ?? createInitialDocument()
}
