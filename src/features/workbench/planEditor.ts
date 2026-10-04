import { clampItemPosition } from '../../shared/layoutRules'
import type { DeskItem, WorkspacePlan } from '../../shared/models'
import { sanitizeDeskMm, sanitizeItemMm } from '../../shared/numeric'

export type DeskSizeField = 'deskWidthMm' | 'deskHeightMm'
export type ItemPatch = Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>

/**
 * 修改桌面尺寸。任何非有限数字（清空后的 NaN、粘贴的 Infinity 等）一律拒绝：
 * 保持原值不变，由输入框把合法值重新展示给用户。
 * 尺寸变更后，所有设备的坐标都会重新约束到新桌面内。
 */
export function editDeskSize(plan: WorkspacePlan, field: DeskSizeField, value: number): WorkspacePlan {
  if (!Number.isFinite(value)) return plan
  const nextDesk = { ...plan, [field]: sanitizeDeskMm(value, plan[field]) }
  const deskWidth = nextDesk.deskWidthMm
  const deskHeight = nextDesk.deskHeightMm
  const items = plan.items.map((item) => {
    const position = clampItemPosition(item.x, item.y, item.widthMm, item.heightMm, deskWidth, deskHeight)
    return position.x === item.x && position.y === item.y ? item : { ...item, x: position.x, y: position.y }
  })
  return { ...nextDesk, items }
}

/**
 * 修改设备尺寸 / 坐标。
 * - 非有限数字：拒绝该字段（绝不写入方案）；
 * - 尺寸越界：纠正到 40–2000 mm；
 * - 坐标越界：纠正到设备仍有一部分处于桌面内；尺寸变化后还会重新约束坐标。
 */
export function editItem(plan: WorkspacePlan, id: string, patch: ItemPatch): WorkspacePlan {
  let changed = false
  const items = plan.items.map((item) => {
    if (item.id !== id) return item
    const next: DeskItem = { ...item }
    if (patch.widthMm !== undefined) {
      if (Number.isFinite(patch.widthMm)) {
        const widthMm = sanitizeItemMm(patch.widthMm, item.widthMm)
        if (widthMm !== item.widthMm) changed = true
        next.widthMm = widthMm
      }
    }
    if (patch.heightMm !== undefined) {
      if (Number.isFinite(patch.heightMm)) {
        const heightMm = sanitizeItemMm(patch.heightMm, item.heightMm)
        if (heightMm !== item.heightMm) changed = true
        next.heightMm = heightMm
      }
    }
    const nextX = patch.x !== undefined && Number.isFinite(patch.x) ? patch.x : next.x
    const nextY = patch.y !== undefined && Number.isFinite(patch.y) ? patch.y : next.y
    const position = clampItemPosition(nextX, nextY, next.widthMm, next.heightMm, plan.deskWidthMm, plan.deskHeightMm)
    next.x = position.x
    next.y = position.y
    if (next.widthMm !== item.widthMm || next.heightMm !== item.heightMm || next.x !== item.x || next.y !== item.y) {
      changed = true
    }
    return next
  })
  return changed ? { ...plan, items } : plan
}

/** 新增设备时也保证落在桌面内。 */
export function addItemToPlan(plan: WorkspacePlan, item: DeskItem): WorkspacePlan {
  const position = clampItemPosition(item.x, item.y, item.widthMm, item.heightMm, plan.deskWidthMm, plan.deskHeightMm)
  return { ...plan, items: [...plan.items, { ...item, x: position.x, y: position.y }] }
}
