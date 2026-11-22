import type { TicketObject } from './contracts'

export type BatchArrayField = 'deps' | 'work' | 'tests' | 'success_criteria'
export type BatchTextField = 'task' | 'work' | 'tests' | 'success_criteria' | 'all'

export type BatchOperation =
  | { kind: 'append'; field: BatchArrayField; value: string }
  | { kind: 'remove'; field: BatchArrayField; value: string }
  | { kind: 'replace'; field: BatchTextField; find: string; replacement: string }

const arrayFields = new Set(['deps', 'work', 'tests', 'success_criteria'])
const textFields = new Set(['task', 'work', 'tests', 'success_criteria', 'all'])

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function replaceStrings(value: unknown, find: string, replacement: string): unknown {
  if (typeof value === 'string') return value.replaceAll(find, replacement)
  if (Array.isArray(value)) return value.map(item => replaceStrings(item, find, replacement))
  if (!isObject(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key, key === 'id' ? item : replaceStrings(item, find, replacement)
  ]))
}

export function applyBatchOperation(ticket: TicketObject, operation: BatchOperation): TicketObject {
  if (!isObject(ticket)) throw new Error('Ticket must be an object')
  const copy = structuredClone(ticket)
  if (operation.kind === 'append' || operation.kind === 'remove') {
    if (!arrayFields.has(operation.field)) throw new Error('Unsupported array field')
    if (typeof operation.value !== 'string' || !operation.value.trim()) {
      throw new Error('Batch list value cannot be empty')
    }
    const existing = copy[operation.field]
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new Error('Field ' + operation.field + ' is not an array')
    }
    const entries: unknown[] = existing === undefined ? [] : (existing as unknown[])
    if (operation.kind === 'append') {
      copy[operation.field] = [...entries, operation.value]
    } else {
      copy[operation.field] = entries.filter(value => value !== operation.value)
    }
    return copy
  }

  if (operation.kind === 'replace') {
    if (!textFields.has(operation.field)) throw new Error('Unsupported text field')
    if (typeof operation.find !== 'string' || !operation.find.length) throw new Error('Find text cannot be empty')
    if (typeof operation.replacement !== 'string') throw new Error('Replacement must be a string')
    if (operation.field === 'all') {
      const result = replaceStrings(copy, operation.find, operation.replacement)
      return result as TicketObject
    }
    const current = copy[operation.field]
    if (current !== undefined) copy[operation.field] = replaceStrings(current, operation.find, operation.replacement)
    return copy
  }
  throw new Error('Unknown batch operation')
}

export function uniqueCopyId(id: string, used: Set<string>): string {
  const base = id + '-copy'
  let candidate = base
  let suffix = 2
  while (used.has(candidate)) candidate = base + '-' + suffix++
  used.add(candidate)
  return candidate
}
