import { describe, expect, it } from 'vitest'
import { collectTicketLocations, parseTicketSource } from './ticket-source'

describe('ticket source', () => {
  it('imports UTF-8 BOM JSON without changing the parsed document', () => {
    expect(parseTicketSource('\uFEFF{"tickets":[]}', 'json'))
      .toEqual({ tickets: [] });
  });

  it('imports BOM-prefixed JSONL with Windows CRLF line endings', () => {
    const source = '\uFEFF{"id":"one","task":"First"}\r\n{"id":"two","task":"Second"}\r\n';
    expect(parseTicketSource(source, 'jsonl')).toEqual([
      { id: 'one', task: 'First' },
      { id: 'two', task: 'Second' },
    ]);
  });

  it('imports JSONL with Unix LF and legacy Mac CR line endings', () => {
    const first = '{"id":"one","task":"First"}';
    const second = '{"id":"two","task":"Second"}';
    for (const newline of ['\n', '\r']) {
      expect(parseTicketSource(first + newline + second, 'jsonl')).toHaveLength(2);
    }
  });

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
