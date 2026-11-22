import { describe, expect, it } from 'vitest'
import {
  appendTicketListItem, convertTicketScalarToList, editTicketListItem,
  editTicketScalar, readTicketField, removeTicketListItem
} from './ticket-fields'

const original = {
  id: 'avm-089',
  task: 'Package and publish developer install',
  deps: ['avm-001', 'avm-004'],
  work: 'Ship wheel/CLI entry point',
  tests: 'Clean supported Windows host installs avm',
  contract: { outputs: { wheel: true }, tags: ['release', 'native'] }
}

describe('lossless ticket field adapter', () => {
  it('distinguishes missing, scalar, list and unsupported fields', () => {
    expect(readTicketField(original, 'success_criteria')).toEqual({ kind: 'missing' })
    expect(readTicketField(original, 'work')).toEqual({
      kind: 'scalar', value: 'Ship wheel/CLI entry point'
    })
    expect(readTicketField(original, 'deps')).toEqual({
      kind: 'list', values: ['avm-001', 'avm-004']
    })
    expect(readTicketField({ work: { nested: true } }, 'work')).toEqual({ kind: 'unsupported' })
    expect(readTicketField({ tests: [1, 'ok'] }, 'tests')).toEqual({ kind: 'unsupported' })
    expect(readTicketField({ tests: null }, 'tests')).toEqual({ kind: 'unsupported' })
  })

  it('edits scalar text while preserving its JSON type and other fields', () => {
    const changed = editTicketScalar(original, 'work', 'Ship the installed wheel')
    expect(changed.work).toBe('Ship the installed wheel')
    expect(changed.tests).toBe(original.tests)
    expect(changed.deps).toEqual(original.deps)
    expect(changed.contract).toEqual(original.contract)
    expect(original.work).toBe('Ship wheel/CLI entry point')
    expect(changed).not.toHaveProperty('success_criteria')
  })

  it('edits, appends and removes list entries without changing original arrays', () => {
    const changed = editTicketListItem(original, 'deps', 1, 'avm-084')
    expect(changed.deps).toEqual(['avm-001', 'avm-084'])
    expect(original.deps).toEqual(['avm-001', 'avm-004'])
    expect(appendTicketListItem(changed, 'deps').deps).toEqual(['avm-001', 'avm-084', ''])
    expect(removeTicketListItem(changed, 'deps', 0).deps).toEqual(['avm-084'])
    expect(appendTicketListItem(original, 'success_criteria').success_criteria).toEqual([''])
  })

  it('requires explicit conversion before a scalar can become a list', () => {
    expect(() => appendTicketListItem(original, 'work')).toThrow(/Convert work/)
    expect(() => editTicketListItem(original, 'tests', 0, 'text')).toThrow(/not a string list/)
    expect(convertTicketScalarToList(original, 'work').work).toEqual(['Ship wheel/CLI entry point'])
    expect(original.work).toBe('Ship wheel/CLI entry point')
    expect(() => convertTicketScalarToList(original, 'deps')).toThrow(/not a text field/)
  })

  it('refuses to change unsupported shapes or indexes instead of dropping values', () => {
    expect(() => appendTicketListItem({ tests: [{ cmd: 'npm test' }] }, 'tests')).toThrow()
    expect(() => editTicketScalar({ work: 42 }, 'work', 'lossy')).toThrow()
    expect(() => editTicketListItem(original, 'deps', 3, 'invalid')).toThrow(RangeError)
    expect(() => removeTicketListItem(original, 'deps', -1)).toThrow(RangeError)
  })

  it('preserves every other nested property in JSON after a form edit', () => {
    const updated = editTicketScalar(original, 'task', 'New task')
    const roundTrip = JSON.parse(JSON.stringify(updated))
    expect(roundTrip).toEqual({ ...original, task: 'New task' })
  })
})
