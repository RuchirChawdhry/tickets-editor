import { describe, expect, it } from 'vitest'
import { appendTicket, locateNode, removeNode, replaceNode } from './document-mutations'

describe('nested document edits', () => {
  it('replaces a nested ticket and preserves metadata', () => {
    const root = { project: 'DLL Viewer', phases: [{ name: 'Discovery', tickets: [{ id: 'a', task: 'Old' }] }] }
    const path = ['phases', 0, 'tickets', 0]
    replaceNode(root, path, { id: 'a', task: 'New', success_criteria: ['Pass'] })
    expect(locateNode(root, path)).toEqual({ id: 'a', task: 'New', success_criteria: ['Pass'] })
    expect(root.project).toBe('DLL Viewer')
    expect(root.phases[0].name).toBe('Discovery')
  })

  it('deletes one nested ticket without removing its parent', () => {
    const root = { phases: [{ tickets: [{ id: 'a' }, { id: 'b' }] }] }
    removeNode(root, ['phases', 0, 'tickets', 0])
    expect(root.phases[0].tickets).toEqual([{ id: 'b' }])
  })

  it('appends a ticket to the existing nested collection', () => {
    const root = { phases: [{ tickets: [{ id: 'a', task: 'First' }] }] }
    appendTicket(root, ['phases', 0, 'tickets', 0])
    expect(root.phases[0].tickets).toHaveLength(2)
    expect(root.phases[0].tickets[1]).not.toHaveProperty('success_criteria')
    expect(root).not.toHaveProperty('tickets')
  })

  it('uses a root tickets collection for an empty object', () => {
    const root: Record<string, unknown> = { title: 'Example' }
    appendTicket(root, null)
    expect(root.title).toBe('Example')
    expect(root.tickets).toHaveLength(1)
  })
})
