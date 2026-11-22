import type { TicketObject } from './contracts'

export type TicketFieldView =
  | { kind: 'missing' }
  | { kind: 'scalar'; value: string }
  | { kind: 'list'; values: string[] }
  | { kind: 'unsupported' }

/**
 * The form is a lossless projection of the JSON ticket.
 * Never stringify unknown entries or replace a scalar with an array implicitly.
 */
export function readTicketField(ticket: TicketObject, field: string): TicketFieldView {
  if (!Object.prototype.hasOwnProperty.call(ticket, field)) return { kind: 'missing' }
  const value = ticket[field]
  if (typeof value === 'string') return { kind: 'scalar', value }
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    return { kind: 'list', values: [...value] }
  }
  return { kind: 'unsupported' }
}

export function editTicketScalar(ticket: TicketObject, field: string, text: string): TicketObject {
  if (readTicketField(ticket, field).kind !== 'scalar') {
    throw new TypeError(field + ' is not a text field')
  }
  return { ...ticket, [field]: text }
}

function requireList(ticket: TicketObject, field: string): string[] {
  const view = readTicketField(ticket, field)
  if (view.kind !== 'list') throw new TypeError(field + ' is not a string list')
  return view.values
}

export function editTicketListItem(
  ticket: TicketObject, field: string, index: number, text: string
): TicketObject {
  const values = requireList(ticket, field)
  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    throw new RangeError('Invalid ticket list index')
  }
  values[index] = text
  return { ...ticket, [field]: values }
}

export function appendTicketListItem(ticket: TicketObject, field: string): TicketObject {
  const view = readTicketField(ticket, field)
  if (view.kind !== 'missing' && view.kind !== 'list') {
    throw new TypeError('Convert ' + field + ' to a list explicitly before adding items')
  }
  return { ...ticket, [field]: [...(view.kind === 'list' ? view.values : []), ''] }
}

export function removeTicketListItem(
  ticket: TicketObject, field: string, index: number
): TicketObject {
  const values = requireList(ticket, field)
  if (!Number.isInteger(index) || index < 0 || index >= values.length) {
    throw new RangeError('Invalid ticket list index')
  }
  return { ...ticket, [field]: values.filter((_, i) => i !== index) }
}

export function convertTicketScalarToList(ticket: TicketObject, field: string): TicketObject {
  const view = readTicketField(ticket, field)
  if (view.kind !== 'scalar') throw new TypeError(field + ' is not a text field')
  return { ...ticket, [field]: [view.value] }
}
