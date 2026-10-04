/**
 * 数值输入的统一边界与解析层。
 * 所有来自用户输入或持久化数据的数字都必须经过这里，保证方案里只会出现有限、取整、落在合理区间内的毫米数。
 */

export const DESK_MIN_MM = 600
export const DESK_MAX_MM = 4000
export const ITEM_MIN_MM = 40
export const ITEM_MAX_MM = 2000

function toFinite(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * 解析输入框文本：空字符串、非法粘贴（含 Infinity / 科学计数溢出）一律视为拒绝输入，返回 null。
 */
export function parseNumericInput(text: string): number | null {
  return toFinite(text)
}

/**
 * 读取可能来自存储（JSON 里 NaN 会变成 null）的数字；不可用时返回 null，交由调用方决定回退值。
 */
export function readFiniteNumber(value: unknown): number | null {
  return toFinite(value)
}

function roundToInt(value: number): number {
  return Math.round(value)
}

/**
 * 纠正到闭区间 [min, max] 并取整。调用前需保证 value 是有限数字。
 */
export function clampToIntRange(value: number, min: number, max: number): number {
  return roundToInt(Math.min(max, Math.max(min, value)))
}

/** 桌面宽/深：600–4000 mm，非法值回退到 fallback（仅在没有可纠正来源时使用）。 */
export function sanitizeDeskMm(value: unknown, fallback: number): number {
  const finite = toFinite(value)
  const fallbackValue = Number.isFinite(fallback) ? fallback : 1600
  return clampToIntRange(finite ?? fallbackValue, DESK_MIN_MM, DESK_MAX_MM)
}

/** 设备宽/深：40–2000 mm，非法值回退到 fallback。 */
export function sanitizeItemMm(value: unknown, fallback: number): number {
  const finite = toFinite(value)
  const fallbackValue = Number.isFinite(fallback) ? fallback : ITEM_MIN_MM
  return clampToIntRange(finite ?? fallbackValue, ITEM_MIN_MM, ITEM_MAX_MM)
}
