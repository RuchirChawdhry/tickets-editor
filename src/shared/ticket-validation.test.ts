import { describe, expect, it } from 'vitest'
import { validateTicket } from './ticket-validation'

describe('ticket validation', () => {
  it('accepts compact tickets without success criteria', () => {
    expect(validateTicket({
      id: 'avm-089',
      task: 'Package and publish developer install',
      deps: ['avm-001'], work: 'Ship wheel/CLI entry point',
      tests: 'Clean Windows host installs avm'
    })).toEqual({ valid: true, errors: [] })
  })

  it('accepts empty or provided optional criteria', () => {
    for (const success_criteria of [[], ['All exports indexed'], 'Exports indexed']) {
      expect(validateTicket({ id: 'dll-004', task: 'Index DLLs', success_criteria }).valid).toBe(true)
    }
  })

  it('rejects malformed optional criteria without making them mandatory', () => {
    const invalid = [
      ['Indexed', ' '], ' ', 42, { must: 'pass' }, [null]
    ]
    for (const success_criteria of invalid) {
      expect(validateTicket({ id: 'dll-004', task: 'Index DLLs', success_criteria }).valid).toBe(false)
    }
  })

  it('still requires id and task', () => {
    expect(validateTicket({ id: ' ', task: 'Index' }).errors).toContain('id must be a nonempty string')
    expect(validateTicket({ id: 'x', task: '' }).errors).toContain('task must be a nonempty string')
    expect(validateTicket([]).valid).toBe(false)
  })

  it('allows additional nested JSON fields', () => {
    expect(validateTicket({
      id: 'dll-004', task: 'Index DLLs',
      contract: { output: { sqlite: true } },
      work: ['Scan exports'], tests: ['All exports indexed']
    })).toEqual({ valid: true, errors: [] })
  })
})
