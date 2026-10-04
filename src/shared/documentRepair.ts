import {
  createId,
  DEFAULT_DESK,
  type DeskItem,
  type DeviceType,
  type WorkspaceDocument,
  type WorkspacePlan,
} from './models'
import {
  DESK_MAX_MM,
  DESK_MIN_MM,
  ITEM_MAX_MM,
  ITEM_MIN_MM,
  readFiniteNumber,
  sanitizeDeskMm,
  sanitizeItemMm,
} from './numeric'
import { clampItemPosition, normalizeRotation } from './layoutRules'

const DEVICE_TYPES: DeviceType[] = ['monitor', 'keyboard', 'lamp', 'speaker', 'stand']

function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidItemShape(value: unknown): value is DeskItem {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return isValidString(candidate.id)
    && DEVICE_TYPES.includes(candidate.type as DeviceType)
    && isValidFiniteNumber(candidate.widthMm)
    && isValidFiniteNumber(candidate.heightMm)
    && isValidFiniteNumber(candidate.x)
    && isValidFiniteNumber(candidate.y)
    && isValidFiniteNumber(candidate.rotation)
}

function isDeskSizeValid(value: unknown): boolean {
  return isValidFiniteNumber(value) && value >= DESK_MIN_MM && value <= DESK_MAX_MM
}

function isItemSizeValid(value: unknown): boolean {
  return isValidFiniteNumber(value) && value >= ITEM_MIN_MM && value <= ITEM_MAX_MM
}

function isHealthyItem(value: unknown): value is DeskItem {
  if (!isValidItemShape(value)) return false
  return isItemSizeValid(value.widthMm) && isItemSizeValid(value.heightMm)
}

function isHealthyPlan(value: unknown): value is WorkspacePlan {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return isValidString(candidate.id)
    && typeof candidate.name === 'string'
    && isDeskSizeValid(candidate.deskWidthMm)
    && isDeskSizeValid(candidate.deskHeightMm)
    && Array.isArray(candidate.items)
    && candidate.items.every(isHealthyItem)
    && isValidString(candidate.updatedAt)
    && !Number.isNaN(Date.parse(candidate.updatedAt as string))
}

/** 严格校验：结构完整且所有数值都在合理区间。供保存前断言与测试使用。 */
export function isValidWorkspaceDocument(value: unknown): value is WorkspaceDocument {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return candidate.version === 1
    && Array.isArray(candidate.plans)
    && candidate.plans.length > 0
    && candidate.plans.every(isHealthyPlan)
    && isValidString(candidate.activePlanId)
    && (candidate.plans as WorkspacePlan[]).some((plan) => plan.id === candidate.activePlanId)
}

function coerceItem(value: unknown, deskWidth: number, deskHeight: number): DeskItem | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const type = DEVICE_TYPES.includes(candidate.type as DeviceType) ? candidate.type as DeviceType : 'monitor'
  const widthMm = sanitizeItemMm(candidate.widthMm, ITEM_MIN_MM)
  const heightMm = sanitizeItemMm(candidate.heightMm, ITEM_MIN_MM)
  const rotation = normalizeRotation(typeof candidate.rotation === 'number' ? candidate.rotation : 0)
  const requestedX = readFiniteNumber(candidate.x) ?? 0
  const requestedY = readFiniteNumber(candidate.y) ?? 0
  const position = clampItemPosition(requestedX, requestedY, widthMm, heightMm, deskWidth, deskHeight)
  return {
    id: isValidString(candidate.id) ? candidate.id : createId('item'),
    type,
    widthMm,
    heightMm,
    x: position.x,
    y: position.y,
    rotation,
  }
}

function coercePlan(value: unknown): WorkspacePlan | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const deskWidthMm = sanitizeDeskMm(candidate.deskWidthMm, DEFAULT_DESK.widthMm)
  const deskHeightMm = sanitizeDeskMm(candidate.deskHeightMm, DEFAULT_DESK.heightMm)
  const rawItems = Array.isArray(candidate.items) ? candidate.items : []
  const items = rawItems
    .map((entry) => coerceItem(entry, deskWidthMm, deskHeightMm))
    .filter((entry): entry is DeskItem => entry !== null)
  const updatedAt = isValidString(candidate.updatedAt) && !Number.isNaN(Date.parse(candidate.updatedAt))
    ? candidate.updatedAt
    : new Date().toISOString()
  return {
    id: isValidString(candidate.id) ? candidate.id : createId('plan'),
    name: typeof candidate.name === 'string' && candidate.name.trim() !== '' ? candidate.name.slice(0, 60) : '我的工作台',
    deskWidthMm,
    deskHeightMm,
    items,
    updatedAt,
  }
}

export interface DocumentRepairResult {
  document: WorkspaceDocument
  repaired: boolean
}

/**
 * 打开方案时的自愈入口：
 * - 完全无法识别（非对象、版本不符、一个方案都救不回来）→ null，交给上层新建方案；
 * - 结构可识别但含非法数字（NaN/null、越界、缺字段）→ 逐项纠正并标记 repaired；
 * - 本身健康 → 原样返回。
 */
export function repairWorkspaceDocument(value: unknown): DocumentRepairResult | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1) return null
  if (!Array.isArray(candidate.plans)) return null

  if (isValidWorkspaceDocument(value)) {
    return { document: value as WorkspaceDocument, repaired: false }
  }

  const plans = candidate.plans
    .map((entry) => coercePlan(entry))
    .filter((entry): entry is WorkspacePlan => entry !== null)
  if (plans.length === 0) return null

  const requestedActiveId = isValidString(candidate.activePlanId) ? candidate.activePlanId : null
  const activePlanId = requestedActiveId && plans.some((plan) => plan.id === requestedActiveId)
    ? requestedActiveId
    : plans[0].id

  return {
    document: { version: 1, plans, activePlanId },
    repaired: true,
  }
}
