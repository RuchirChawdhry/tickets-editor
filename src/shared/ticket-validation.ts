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
  // Criteria are optional: compact agent tickets often omit this field.
  // When provided, accept a nonempty string or a list of nonempty strings.
  // An empty array is valid because no minimum count is imposed.
  if (Object.prototype.hasOwnProperty.call(value, 'success_criteria')) {
    const criteria = value.success_criteria
    if (typeof criteria === 'string' ? !nonEmptyString(criteria)
      : !Array.isArray(criteria) || !criteria.every(nonEmptyString)) {
      errors.push('success_criteria must be text or a list of nonempty strings')
    }
  }

  return { valid: errors.length === 0, errors }
}
