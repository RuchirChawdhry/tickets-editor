import { describe, expect, it } from 'vitest'
import { applyBatchOperation, uniqueCopyId } from './batch-operations'

const ticket = {
  id: 'te-010', task: 'Index exports',
  deps: ['te-002'], work: ['Index exports'], tests: ['All exports indexed'],
  success_criteria: ['The export list is complete'],
  contract: { path: 'exports', label: 'Index exports' }
}
describe('batch ticket changes', () => {
  it('adds a dependency without altering the original object or nested fields', () => {
    const updated = applyBatchOperation(ticket, { kind: 'append', field: 'deps', value: 'te-004' })
    expect(updated.deps).toEqual(['te-002', 'te-004'])
    expect(ticket.deps).toEqual(['te-002'])
    expect(updated.contract).toEqual(ticket.contract)
  })
  it('removes matching list entries only', () => {
    const updated = applyBatchOperation(ticket, { kind: 'remove', field: 'deps', value: 'te-002' })
    expect(updated.deps).toEqual([])
    expect(updated.id).toBe('te-010')
  })
  it('replaces nested text but never modifies the ticket ID', () => {
    const updated = applyBatchOperation(ticket, {
      kind: 'replace', field: 'all', find: 'Index', replacement: 'Scan'
    })
    expect(updated.id).toBe('te-010')
    expect(updated.task).toBe('Scan exports')
    expect((updated.contract as { label: string }).label).toBe('Scan exports')
  })
  it('rejects empty find/append values instead of applying an ambiguous edit', () => {
    expect(() => applyBatchOperation(ticket, { kind: 'replace', field: 'all', find: '', replacement: 'x' })).toThrow()
    expect(() => applyBatchOperation(ticket, { kind: 'append', field: 'deps', value: '  ' })).toThrow()
  })
  it('generates stable unique duplicate IDs', () => {
    const taken = new Set(['te-010-copy'])
    expect(uniqueCopyId('te-010', taken)).toBe('te-010-copy-2')
    expect(taken.has('te-010-copy-2')).toBe(true)
  })
})
