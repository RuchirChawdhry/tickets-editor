import { describe, expect, it } from 'vitest'
import { collectTicketLocations, parseTicketSource } from './ticket-source'

describe('ticket source', () => {
  it('parses JSONL lines containing nested objects', () => {
    const source = [
      '{"id":"a","task":"First","contract":{"nested":true}}',
      '{"id":"b","task":"Second","success_criteria":["Pass"]}'
    ].join('\n')
    expect(parseTicketSource(source, 'jsonl')).toEqual([
      { id: 'a', task: 'First', contract: { nested: true } },
      { id: 'b', task: 'Second', success_criteria: ['Pass'] }
    ])
  })

  it('reports source line for invalid JSONL', () => {
    expect(() => parseTicketSource('{"id":"a"}\nnot-json', 'jsonl'))
      .toThrow('Invalid JSONL at line 2')
  })

  it('indexes nested ticket positions without flattening parents', () => {
    const root = { phases: [{ tickets: [{ id: 'dll-004', task: 'Index', success_criteria: ['Pass'] }] }] }
    const matches = collectTicketLocations(root)
    expect(matches).toEqual([{
      number: 1,
      ticketId: 'dll-004',
      path: ['phases', 0, 'tickets', 0],
      pointer: '/phases/0/tickets/0'
    }])
    expect(root.phases[0].tickets[0].id).toBe('dll-004')
  })

  it('escapes JSON pointer segments', () => {
    const root = { 'a/b': { '~tickets': [{ id: 'x', task: 'T' }] } }
    expect(collectTicketLocations(root)[0]?.pointer).toBe('/a~1b/~0tickets/0')
  })
})
