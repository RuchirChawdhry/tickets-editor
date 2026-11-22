import { describe, expect, it } from 'vitest'
import { parseTicketDraft, rootPropertySpan, ticketFieldDiagnostics } from './ticket-diagnostics'

describe('ticket JSON diagnostics', () => {
  it('keeps invalid JSON as a draft instead of accepting a new ticket', () => {
    const result = parseTicketDraft('{"id":"te-001",')
    expect(result.ticket).toBeNull()
    expect(result.parseError).toBeTruthy()
  })

  it('rejects arrays and primitives as ticket roots', () => {
    expect(parseTicketDraft('[]').parseError).toBe('Ticket must be a JSON object')
    expect(parseTicketDraft('null').parseError).toBe('Ticket must be a JSON object')
  })

  it('accepts compact drafts without success criteria', () => {
    const result = parseTicketDraft('{"id":"t-001","task":"Implement","work":"Ship CLI"}')
    expect(result.ticket?.id).toBe('t-001')
    expect(result.parseError).toBeNull()
    expect(result.validation.valid).toBe(true)
    expect(ticketFieldDiagnostics('{"id":"t-001","task":"Implement"}')).toEqual([])
  })

  it('highlights the root key even when a nested object uses the same name', () => {
    const source = '{"contract":{"task":"nested"},"task":"","id":"x","success_criteria":[]}'
    const span = rootPropertySpan(source, 'task')
    expect(span).not.toBeNull()
    expect(source.slice(span!.from, span!.to)).toBe('"task"')
    expect(span!.from).toBe(source.lastIndexOf('"task"'))
  })

  it('understands escaped strings without treating their contents as keys', () => {
    const source = JSON.stringify({ note: 'text with "task" inside', task: '' })
    const span = rootPropertySpan(source, 'task')
    expect(span?.from).toBe(source.lastIndexOf('"task"'))
  })

  it('locates semantic errors at key positions', () => {
    const source = '{\n  "id": "x",\n  "task": "",\n  "success_criteria": [" "]\n}'
    const diagnostics = ticketFieldDiagnostics(source)
    expect(diagnostics.map(d => source.slice(d.from, d.to))).toEqual(['"task"', '"success_criteria"'])
    expect(diagnostics.every(d => d.severity === 'error')).toBe(true)
  })

  it('does not emit semantic diagnostics for malformed JSON', () => {
    expect(ticketFieldDiagnostics('{"task":')).toEqual([])
  })
})
