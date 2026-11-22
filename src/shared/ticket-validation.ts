import type { TicketValidation } from './contracts'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateTicket(value: unknown): TicketValidation {
  if (!isObject(value)) return { valid: false, errors: ['Ticket must be a JSON object'] }

  const errors: string[] = []
  if (!nonEmptyString(value.id)) errors.push('id must be a nonempty string')
  if (!nonEmptyString(value.task)) errors.push('task must be a nonempty string')
  if (!Array.isArray(value.success_criteria) || value.success_criteria.length === 0) {
    errors.push('success_criteria must contain at least one criterion')
  } else if (!value.success_criteria.every(nonEmptyString)) {
    errors.push('Every success criterion must be a nonempty string')
  }

  return { valid: errors.length === 0, errors }
}
