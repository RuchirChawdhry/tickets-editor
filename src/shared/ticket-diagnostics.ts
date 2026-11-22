import type { TicketObject, TicketValidation } from './contracts'
import { validateTicket } from './ticket-validation'

export interface TicketDraftParse {
  ticket: TicketObject | null
  parseError: string | null
  validation: TicketValidation
}

export interface TicketFieldDiagnostic {
  from: number
  to: number
  severity: 'error'
  message: string
}

export function parseTicketDraft(text: string): TicketDraftParse {
  let value: unknown
  try {
    value = JSON.parse(text) as unknown
  } catch (error) {
    return {
      ticket: null,
      parseError: error instanceof Error ? error.message : String(error),
      validation: { valid: false, errors: [] }
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ticket: null,
      parseError: 'Ticket must be a JSON object',
      validation: { valid: false, errors: [] }
    }
  }
  const ticket = value as TicketObject
  return { ticket, parseError: null, validation: validateTicket(ticket) }
}

// Find only root-level JSON properties, not identically named nested keys.
export function rootPropertySpan(text: string, key: string): { from: number; to: number } | null {
  let depth = 0
  for (let index = 0; index < text.length;) {
    const char = text[index]
    if (char === '"') {
      const start = index++
      let escaped = false
      while (index < text.length) {
        const c = text[index++]
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') break
      }
      const end = index
      if (depth !== 1) continue
      let following = end
      while (following < text.length && /\s/u.test(text[following])) following++
      if (text[following] !== ':') continue
      try {
        if (JSON.parse(text.slice(start, end)) === key) return { from: start, to: end }
      } catch { /* Invalid syntax is handled by CodeMirror's JSON syntax linter. */ }
      continue
    }
    if (char === '{' || char === '[') depth++
    else if (char === '}' || char === ']') depth--
    index++
  }
  return null
}

export function ticketFieldDiagnostics(text: string): TicketFieldDiagnostic[] {
  const result = parseTicketDraft(text)
  if (result.parseError) return []
  const offset = Math.max(0, text.indexOf('{'))
  return result.validation.errors.map(message => {
    const field = message.startsWith('id ') ? 'id'
      : message.startsWith('task ') ? 'task'
        : 'success_criteria'
    const span = rootPropertySpan(text, field)
    const from = span?.from ?? offset
    const to = span?.to ?? Math.min(text.length, from + 1)
    return { from, to, severity: 'error' as const, message }
  })
}
