/**
 * 数值输入草稿的统一解释规则（位置、设备尺寸、桌面尺寸共用）。
 *
 * 约定：
 * - 空输入 / 无法解析的文本（粘贴了字母等）      -> 'invalid'，绝不写入，失焦时回退
 * - 正在输入的半截数字（"-"、"."、"1e3" 的半截） -> 'incomplete'，等待用户继续输入
 * - 有限数字但超出 [min, max]                    -> 'out-of-range'，失焦时夹到边界
 * - 合法数字                                    -> 'valid'，立即实时写入
 *
 * 任何情况下解析器都不会返回 NaN/Infinity。
 */
export type DraftStatus = 'empty' | 'invalid' | 'incomplete' | 'out-of-range' | 'valid'

export interface DraftEvaluation {
  status: DraftStatus
  /** 解析出的有限数字；incomplete/invalid/empty 时为 null */
  value: number | null
  /** 夹取到范围后真正应该写进方案的值 */
  clamped: number
}

// 纯符号/科学计数法的半截写法（浏览器 number 输入框允许输入过程中出现这些）
const INCOMPLETE_PATTERN = /^[+-]?\d*\.?\d*(?:e[+-]?\d*)?$/i
// 语法上还能继续输入的形态：结尾的小数点或未写完的指数（Number() 会把 "12." 解析成 12）
const OPEN_ENDED_PATTERN = /(?:\.\s*$|e[+-]?\s*$)/i

export function evaluateNumericDraft(raw: string, min: number, max: number): DraftEvaluation {
  const text = raw.trim()
  if (text === '') return { status: 'empty', value: null, clamped: min }

  if (OPEN_ENDED_PATTERN.test(text)) return { status: 'incomplete', value: null, clamped: min }

  const parsed = Number(text)
  if (Number.isNaN(parsed)) {
    return INCOMPLETE_PATTERN.test(text)
      ? { status: 'incomplete', value: null, clamped: min }
      : { status: 'invalid', value: null, clamped: min }
  }
  // 1e400 等能通过语法解析但溢出成 Infinity 的输入，属于明确的极端非法值
  if (!Number.isFinite(parsed)) return { status: 'invalid', value: null, clamped: min }

  const rounded = Math.round(parsed)
  if (rounded < min || rounded > max) {
    return { status: 'out-of-range', value: rounded, clamped: Math.min(max, Math.max(min, rounded)) }
  }
  return { status: 'valid', value: rounded, clamped: rounded }
}

/** 浏览器 number 输入框粘贴非法字符时，原始 value 为空但 validity.badInput 为 true。 */
export function isBadNumberInput(input: HTMLInputElement): boolean {
  return Boolean(input.validity && input.validity.badInput)
}
