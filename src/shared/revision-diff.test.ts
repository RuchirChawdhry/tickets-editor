import { describe, expect, it } from 'vitest'
import { buildRevisionDiff, visibleDiffRows } from './revision-diff'

describe('read-only revision comparison', () => {
  it('ignores JSON whitespace differences', () => {
    const result = buildRevisionDiff('{"tickets":[{"id":"a"}]}', '{\n"tickets": [ { "id": "a" } ]\n}')
    expect(result.hunks).toHaveLength(0)
    expect(result.rows.every(row => row.kind === 'equal')).toBe(true)
  })

  it('shows changed fields with aligned line numbers', () => {
    const old = JSON.stringify({ tickets: [{ id: 'a', task: 'Old' }] })
    const next = JSON.stringify({ tickets: [{ id: 'a', task: 'New' }] })
    const diff = buildRevisionDiff(old, next)
    expect(diff.changed).toBe(1)
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
    expect(diff.hunks).toHaveLength(1)
    const changed = diff.rows.find(row => row.kind === 'changed')
    expect(changed?.before?.text).toContain('Old')
    expect(changed?.after?.text).toContain('New')
    expect(changed?.before?.number).toBe(changed?.after?.number)
  })

  it('aligns inserted and removed lines without inventing a corresponding side', () => {
    const before = JSON.stringify({ tickets: [{ id: 'a', task: 'A' }] })
    const after = JSON.stringify({ tickets: [{ id: 'a', task: 'A', tests: ['pass'] }] })
    const add = buildRevisionDiff(before, after)
    expect(add.rows.some(row => row.kind === 'added' && !row.before && !!row.after)).toBe(true)
    const remove = buildRevisionDiff(after, before)
    expect(remove.rows.some(row => row.kind === 'removed' && !!row.before && !row.after)).toBe(true)
  })

  it('collapses only unchanged regions and preserves every change', () => {
    const before = JSON.stringify({ entries: Array.from({ length: 100 }, (_, i) => ({ id: i, text: 'row-' + i })) })
    const after = JSON.stringify({ entries: Array.from({ length: 100 }, (_, i) =>
      ({ id: i, text: i === 50 ? 'corrected' : 'row-' + i })) })
    const diff = buildRevisionDiff(before, after)
    const visible = visibleDiffRows(diff)
    expect(visible.some(row => row.kind === 'gap')).toBe(true)
    expect(visible.filter(row => row.kind === 'row' && row.row.kind !== 'equal')).toHaveLength(1)
  })

  it('handles large documents using unique anchors without a quadratic matrix', () => {
    const before = JSON.stringify(Array.from({ length: 1200 }, (_, i) => ({ id: 'ticket-' + i, task: 'Task-' + i })))
    const after = JSON.stringify(Array.from({ length: 1200 }, (_, i) => ({ id: 'ticket-' + i, task: i === 600 ? 'Changed task' : 'Task-' + i })))
    const diff = buildRevisionDiff(before, after)
    expect(diff.changed).toBe(1)
    expect(diff.hunks).toHaveLength(1)
  })

  it('leaves the original JSON strings unchanged', () => {
    const before = '{"task":"One"}'
    const after = '{"task":"Two"}'
    buildRevisionDiff(before, after)
    expect(before).toBe('{"task":"One"}')
    expect(after).toBe('{"task":"Two"}')
  })
})
