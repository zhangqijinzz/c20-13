import type { DeskItem, DeviceType, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'
import { DEVICE_DEFINITIONS } from './models'

/**
 * 所有可编辑数值的合法范围（毫米 / 像素位置）。
 * 任何写进方案的数字都必须落在这些范围内，UI 与存档修复共用同一套标准。
 */
export const VALUE_LIMITS = {
  deskMin: 600,
  deskMax: 4000,
  itemMin: 40,
  itemMax: 2000,
  positionMin: -2000,
  positionMax: 6000,
} as const

export const VALID_DEVICE_TYPES = DEVICE_DEFINITIONS.map((device) => device.type)

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 把不可信的输入数字纠正到 [min, max]。
 * - 有限但越界：夹到边界并视为“被纠正”
 * - NaN / Infinity / 非数字：使用 fallback（fallback 本身也会被夹到范围内）
 */
export function sanitizeBoundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  const finite = toFiniteNumber(value)
  if (finite === null) return Math.min(max, Math.max(min, Math.round(fallback)))
  return Math.min(max, Math.max(min, Math.round(finite)))
}

/**
 * 判断一个值是否“无法使用”（NaN / Infinity / 类型不对）。
 * 与 sanitizeBoundedNumber 不同：这里不做兜底，直接拒绝，供写入路径使用。
 */
export function isRejectedNumber(value: unknown): boolean {
  return toFiniteNumber(value) === null
}

export function clampDeskSize(value: unknown, fallback: number): number {
  return sanitizeBoundedNumber(value, VALUE_LIMITS.deskMin, VALUE_LIMITS.deskMax, fallback)
}

export function clampItemDimension(value: unknown, fallback: number): number {
  return sanitizeBoundedNumber(value, VALUE_LIMITS.itemMin, VALUE_LIMITS.itemMax, fallback)
}

export function clampPosition(value: unknown, fallback: number): number {
  return sanitizeBoundedNumber(value, VALUE_LIMITS.positionMin, VALUE_LIMITS.positionMax, fallback)
}

export function isValidDeviceType(value: unknown): value is DeviceType {
  return typeof value === 'string' && (VALID_DEVICE_TYPES as string[]).includes(value)
}

export function isSafeItem(item: unknown): item is DeskItem {
  if (!item || typeof item !== 'object') return false
  const candidate = item as Record<string, unknown>
  return typeof candidate.id === 'string'
    && isValidDeviceType(candidate.type)
    && isSafeDimension(candidate.widthMm, VALUE_LIMITS.itemMin, VALUE_LIMITS.itemMax)
    && isSafeDimension(candidate.heightMm, VALUE_LIMITS.itemMin, VALUE_LIMITS.itemMax)
    && isSafeDimension(candidate.x, VALUE_LIMITS.positionMin, VALUE_LIMITS.positionMax)
    && isSafeDimension(candidate.y, VALUE_LIMITS.positionMin, VALUE_LIMITS.positionMax)
    && typeof candidate.rotation === 'number'
    && Number.isFinite(candidate.rotation)
}

function isSafeDimension(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function getItemBounds(item: DeskItem): ItemBounds {
  const radians = (normalizeRotation(item.rotation) * Math.PI) / 180
  const width = Math.abs(item.widthMm * Math.cos(radians)) + Math.abs(item.heightMm * Math.sin(radians))
  const height = Math.abs(item.widthMm * Math.sin(radians)) + Math.abs(item.heightMm * Math.cos(radians))
  const centerX = item.x + item.widthMm / 2
  const centerY = item.y + item.heightMm / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
  }
}

export function rectanglesOverlap(first: ItemBounds, second: ItemBounds): boolean {
  const horizontal = Math.min(first.right, second.right) - Math.max(first.left, second.left)
  const vertical = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top)
  return horizontal > 1 && vertical > 1
}

export function analyzeLayout(plan: WorkspacePlan): LayoutAnalysis {
  const overlapIds = new Set<string>()
  const outOfBoundsIds = new Set<string>()
  const bounds = new Map(plan.items.map((item) => [item.id, getItemBounds(item)]))

  plan.items.forEach((item) => {
    const itemBounds = bounds.get(item.id)
    if (!itemBounds) return
    if (itemBounds.left < 0 || itemBounds.top < 0 || itemBounds.right > plan.deskWidthMm || itemBounds.bottom > plan.deskHeightMm) {
      outOfBoundsIds.add(item.id)
    }
  })

  for (let index = 0; index < plan.items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < plan.items.length; nextIndex++) {
      const first = plan.items[index]
      const second = plan.items[nextIndex]
      const firstBounds = bounds.get(first.id)
      const secondBounds = bounds.get(second.id)
      if (firstBounds && secondBounds && rectanglesOverlap(firstBounds, secondBounds)) {
        overlapIds.add(first.id)
        overlapIds.add(second.id)
      }
    }
  }

  // 防御：经过修复后的方案桌面尺寸必然合法，这里再挡一层避免任何 0/0 产生 NaN。
  const occupiedArea = plan.items.reduce((total, item) => total + item.widthMm * item.heightMm, 0)
  const deskArea = plan.deskWidthMm * plan.deskHeightMm
  const coveragePercent = deskArea > 0 ? Math.min(100, Math.max(0, Math.round((occupiedArea / deskArea) * 100))) : 0
  const hasIssue = overlapIds.size > 0 || outOfBoundsIds.size > 0
  return {
    overlapIds: [...overlapIds],
    outOfBoundsIds: [...outOfBoundsIds],
    coveragePercent,
    status: hasIssue ? 'attention' : 'clear',
  }
}
