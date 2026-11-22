import { describe, expect, it } from 'vitest'
import { validateTicket } from './ticket-validation'

describe('ticket validation', () => {
  it('requires explicit nonempty success criteria', () => {
    const result = validateTicket({ id: 'dll-004', task: 'Index DLLs', success_criteria: [] })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('success_criteria must contain at least one criterion')
  })

  it('rejects blank individual success criteria', () => {
    const result = validateTicket({ id: 'dll-004', task: 'Index DLLs', success_criteria: ['Indexed', ' '] })
    expect(result.valid).toBe(false)
  })

  it('allows additional nested JSON fields', () => {
    const result = validateTicket({
      id: 'dll-004',
      task: 'Index DLLs',
      success_criteria: ['All exports indexed'],
      contract: { output: { sqlite: true } }
    })
    expect(result).toEqual({ valid: true, errors: [] })
  })
})
