import { describe, expect, it } from 'vitest'
import { evaluateNumericDraft } from '../numericDraft'

describe('evaluateNumericDraft', () => {
  it('treats an emptied input as empty and never yields a number', () => {
    const result = evaluateNumericDraft('', 40, 2000)
    expect(result.status).toBe('empty')
    expect(result.value).toBeNull()
  })

  it('rejects pasted garbage like "abc"', () => {
    const result = evaluateNumericDraft('abc', 40, 2000)
    expect(result.status).toBe('invalid')
    expect(result.value).toBeNull()
  })

  it('recognises half-typed numbers without rejecting them', () => {
    expect(evaluateNumericDraft('-', 40, 2000).status).toBe('incomplete')
    expect(evaluateNumericDraft('.', 40, 2000).status).toBe('incomplete')
    expect(evaluateNumericDraft('1e', 40, 2000).status).toBe('incomplete')
    expect(evaluateNumericDraft('12.', 40, 2000).status).toBe('incomplete')
  })

  it('accepts in-range finite numbers and rounds them', () => {
    const result = evaluateNumericDraft(' 320.4 ', 40, 2000)
    expect(result.status).toBe('valid')
    expect(result.clamped).toBe(320)
  })

  it('allows zero for positions', () => {
    expect(evaluateNumericDraft('0', -2000, 6000).status).toBe('valid')
  })

  it('flags extreme values and reports the clamped boundary', () => {
    expect(evaluateNumericDraft('999999999', 600, 4000)).toMatchObject({ status: 'out-of-range', clamped: 4000 })
    expect(evaluateNumericDraft('-500', 600, 4000)).toMatchObject({ status: 'out-of-range', clamped: 600 })
    expect(evaluateNumericDraft('1e400', 600, 4000).status).toBe('invalid')
  })
})
