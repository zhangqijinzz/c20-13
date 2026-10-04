import { describe, expect, it } from 'vitest'
import {
  DESK_MAX_MM,
  DESK_MIN_MM,
  ITEM_MAX_MM,
  ITEM_MIN_MM,
  clampToIntRange,
  parseNumericInput,
  sanitizeDeskMm,
  sanitizeItemMm,
} from '../numeric'

describe('numeric boundary layer', () => {
  it('rejects empty and non-numeric paste content', () => {
    expect(parseNumericInput('')).toBeNull()
    expect(parseNumericInput('   ')).toBeNull()
    expect(parseNumericInput('abc')).toBeNull()
    expect(parseNumericInput('Infinity')).toBeNull()
    expect(parseNumericInput('-Infinity')).toBeNull()
    expect(parseNumericInput('NaN')).toBeNull()
    expect(parseNumericInput('12abc')).toBeNull()
  })

  it('accepts finite numbers including negatives and decimals', () => {
    expect(parseNumericInput('120')).toBe(120)
    expect(parseNumericInput('  120.5 ')).toBe(120.5)
    expect(parseNumericInput('-15')).toBe(-15)
  })

  it('clamps extreme values to the allowed integer range', () => {
    expect(clampToIntRange(999999, DESK_MIN_MM, DESK_MAX_MM)).toBe(DESK_MAX_MM)
    expect(clampToIntRange(-999999, DESK_MIN_MM, DESK_MAX_MM)).toBe(DESK_MIN_MM)
    expect(clampToIntRange(119.6, ITEM_MIN_MM, ITEM_MAX_MM)).toBe(120)
  })

  it('sanitizes desk and item dimensions with fallbacks', () => {
    expect(sanitizeDeskMm(Number.NaN, 1200)).toBe(1200)
    expect(sanitizeDeskMm(null, 1200)).toBe(1200)
    expect(sanitizeDeskMm(undefined, 1200)).toBe(1200)
    expect(sanitizeDeskMm('500', 1200)).toBe(DESK_MIN_MM)
    expect(sanitizeDeskMm(5000, 1200)).toBe(DESK_MAX_MM)
    expect(sanitizeItemMm(Number.POSITIVE_INFINITY, 180)).toBe(180)
    expect(sanitizeItemMm('garbage', 180)).toBe(180)
  })
})
