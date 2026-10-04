import { normalizeRotation, clampItemPosition } from '../../shared/layoutRules'
import type { DeskItem } from '../../shared/models'

function updateCanvasItem(items: DeskItem[], id: string, updater: (item: DeskItem) => DeskItem): DeskItem[] {
  let changed = false
  const next = items.map((item) => {
    if (item.id !== id) return item
    const updated = updater(item)
    if (updated !== item) changed = true
    return updated
  })
  return changed ? next : items
}

/**
 * 移动设备。任何来源（拖拽、粘贴、极端坐标）都会被纠正到
 * “设备至少有一部分处于桌面内”的整数坐标，NaN/Infinity 会被拒绝并回退到原坐标。
 */
export function moveCanvasItem(items: DeskItem[], id: string, x: number, y: number, deskWidth: number, deskHeight: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => {
    const nextX = Number.isFinite(x) ? x : item.x
    const nextY = Number.isFinite(y) ? y : item.y
    const position = clampItemPosition(nextX, nextY, item.widthMm, item.heightMm, deskWidth, deskHeight)
    if (position.x === item.x && position.y === item.y) return item
    return { ...item, x: position.x, y: position.y }
  })
}

export function rotateCanvasItem(items: DeskItem[], id: string, delta: number): DeskItem[] {
  return updateCanvasItem(items, id, (item) => ({ ...item, rotation: normalizeRotation(item.rotation + delta) }))
}
