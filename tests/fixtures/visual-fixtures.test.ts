import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { collectTicketLocations, parseTicketSource } from '../../src/shared/ticket-source'
import { validateTicket } from '../../src/shared/ticket-validation'

const fixtures = [
  { file: 'sample-tickets.jsonl', format: 'jsonl' as const, expected: 16 },
  { file: 'nested-tickets.json', format: 'json' as const, expected: 16 },
]

describe('visual review ticket fixtures', () => {
  for (const fixture of fixtures) {
    it(`imports ${fixture.file} with valid nested tickets`, () => {
      const path = fileURLToPath(new URL(fixture.file, import.meta.url))
      const data = parseTicketSource(readFileSync(path, 'utf8'), fixture.format)
      const found = collectTicketLocations(data)
      expect(found).toHaveLength(fixture.expected)
      for (const item of found) {
        const ticket = item.path.reduce<unknown>((node, part) => {
          return (node as Record<string, unknown>)[part]
        }, data)
        expect(validateTicket(ticket).valid, item.ticketId).toBe(true)
      }
      expect(new Set(found.map(item => item.ticketId)).size).toBe(fixture.expected)
    })
  }
})
