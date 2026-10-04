import type { DeskItem, ItemBounds, LayoutAnalysis, WorkspacePlan } from './models'
import { DEFAULT_DESK } from './models'
import { DESK_MAX_MM, DESK_MIN_MM, ITEM_MAX_MM, ITEM_MIN_MM, readFiniteNumber, clampToIntRange } from './numeric'

export function normalizeRotation(rotation: number): number {
  if (!Number.isFinite(rotation)) return 0
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

/**
 * 设备左上角坐标的合法整数区间：保证设备至少有一部分处于桌面内；
 * 设备比桌面还大的轴则把它居中。
 */
export function getItemPositionRange(itemWidth: number, itemHeight: number, deskWidth: number, deskHeight: number): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  const safeDeskWidth = clampToIntRange(readFiniteNumber(deskWidth) ?? DEFAULT_DESK.widthMm, DESK_MIN_MM, DESK_MAX_MM)
  const safeDeskHeight = clampToIntRange(readFiniteNumber(deskHeight) ?? DEFAULT_DESK.heightMm, DESK_MIN_MM, DESK_MAX_MM)
  const safeWidth = clampToIntRange(readFiniteNumber(itemWidth) ?? ITEM_MIN_MM, ITEM_MIN_MM, ITEM_MAX_MM)
  const safeHeight = clampToIntRange(readFiniteNumber(itemHeight) ?? ITEM_MIN_MM, ITEM_MIN_MM, ITEM_MAX_MM)

  const axisRange = (itemSize: number, deskSize: number): { min: number; max: number } => {
    const min = Math.min(0, Math.round((deskSize - itemSize) / 2))
    const max = Math.max(0, deskSize - Math.min(itemSize, deskSize))
    return { min, max }
  }

  const horizontal = axisRange(safeWidth, safeDeskWidth)
  const vertical = axisRange(safeHeight, safeDeskHeight)
  return { minX: horizontal.min, maxX: horizontal.max, minY: vertical.min, maxY: vertical.max }
}

/**
 * 把设备左上角坐标纠正到“设备至少有一部分处于桌面内”的整数范围。
 * 调用前 x/y 必须是有限数字（非有限输入在更上层被拒绝）；
 * 若设备本身比桌面宽/深，则居中放置在对应轴上。
 */
export function clampItemPosition(x: number, y: number, itemWidth: number, itemHeight: number, deskWidth: number, deskHeight: number): { x: number; y: number } {
  const range = getItemPositionRange(itemWidth, itemHeight, deskWidth, deskHeight)
  return {
    x: Math.round(Math.min(range.maxX, Math.max(range.minX, x))),
    y: Math.round(Math.min(range.maxY, Math.max(range.minY, y))),
  }
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

  const deskWidth = readFiniteNumber(plan.deskWidthMm)
  const deskHeight = readFiniteNumber(plan.deskHeightMm)
  // 桌面尺寸只兜底非有限数字；合法但越界的尺寸不应被静默改写，越界状态仍要暴露给检查器。
  const safeDeskWidth = deskWidth !== null && deskWidth > 0 ? deskWidth : DEFAULT_DESK.widthMm
  const safeDeskHeight = deskHeight !== null && deskHeight > 0 ? deskHeight : DEFAULT_DESK.heightMm

  // 仅在数字非有限（NaN/null 落库后）时兜底，保证面积与边界运算可计算；
  // 有限但越界的位置/尺寸保持原样，这样越界与重叠才能被正常检出。
  const safeItems = plan.items.map((item) => ({
    ...item,
    widthMm: readFiniteNumber(item.widthMm) ?? ITEM_MIN_MM,
    heightMm: readFiniteNumber(item.heightMm) ?? ITEM_MIN_MM,
    x: readFiniteNumber(item.x) ?? 0,
    y: readFiniteNumber(item.y) ?? 0,
  }))

  const bounds = new Map(safeItems.map((item) => [item.id, getItemBounds(item)]))

  safeItems.forEach((item) => {
    const itemBounds = bounds.get(item.id)
    if (!itemBounds) return
    if (itemBounds.left < 0 || itemBounds.top < 0 || itemBounds.right > safeDeskWidth || itemBounds.bottom > safeDeskHeight) {
      outOfBoundsIds.add(item.id)
    }
  })

  for (let index = 0; index < safeItems.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < safeItems.length; nextIndex += 1) {
      const first = safeItems[index]
      const second = safeItems[nextIndex]
      const firstBounds = bounds.get(first.id)
      const secondBounds = bounds.get(second.id)
      if (firstBounds && secondBounds && rectanglesOverlap(firstBounds, secondBounds)) {
        overlapIds.add(first.id)
        overlapIds.add(second.id)
      }
    }
  }

  const occupiedArea = safeItems.reduce((total, item) => total + item.widthMm * item.heightMm, 0)
  const deskArea = safeDeskWidth * safeDeskHeight
  const coveragePercent = clampToIntRange((occupiedArea / deskArea) * 100, 0, 100)
  const hasIssue = overlapIds.size > 0 || outOfBoundsIds.size > 0
  return {
    overlapIds: [...overlapIds],
    outOfBoundsIds: [...outOfBoundsIds],
    coveragePercent,
    status: hasIssue ? 'attention' : 'clear',
  }
}
