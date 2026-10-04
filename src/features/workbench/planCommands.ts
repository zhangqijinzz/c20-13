import { clampDeskSize, clampItemDimension, clampPosition, isRejectedNumber } from '../../shared/layoutRules'
import { moveCanvasItem, rotateCanvasItem } from '../canvas/canvasViewModel'
import type { DeskItem, WorkspacePlan } from '../../shared/models'

export type ItemNumericPatch = Partial<Pick<DeskItem, 'widthMm' | 'heightMm' | 'x' | 'y'>>

/**
 * 应用属性区里的设备数值修改。
 * 规则：
 * - 传入 NaN/Infinity（例如输入框被清空）时整体拒绝，方案保持原样
 * - 越界的有限值夹到合法范围（调用方据 changed 决定提示文案）
 */
export function applyItemNumericPatch(plan: WorkspacePlan, id: string, patch: ItemNumericPatch): WorkspacePlan {
  if (Object.values(patch).some(isRejectedNumber)) return plan

  let changed = false
  const items = plan.items.map((item) => {
    if (item.id !== id) return item
    const widthMm = patch.widthMm === undefined ? item.widthMm : clampItemDimension(patch.widthMm, item.widthMm)
    const heightMm = patch.heightMm === undefined ? item.heightMm : clampItemDimension(patch.heightMm, item.heightMm)
    const x = patch.x === undefined ? item.x : clampPosition(patch.x, item.x)
    const y = patch.y === undefined ? item.y : clampPosition(patch.y, item.y)
    if (widthMm !== item.widthMm || heightMm !== item.heightMm || x !== item.x || y !== item.y) changed = true
    return { ...item, widthMm, heightMm, x, y }
  })
  return changed ? { ...plan, items } : plan
}

export function applyDeskSize(
  plan: WorkspacePlan,
  field: 'deskWidthMm' | 'deskHeightMm',
  value: number,
): WorkspacePlan {
  if (isRejectedNumber(value)) return plan
  const next = clampDeskSize(value, plan[field])
  return next === plan[field] ? plan : { ...plan, [field]: next }
}

export { moveCanvasItem, rotateCanvasItem }
