import { describe, expect, it } from 'vitest'
import { mergeDependencyTags, removeDependencyTag, tokenizeDependencies } from './dependency-tags'

describe('dependency pill input', () => {
  it('commits a dependency when space or comma is entered', () => {
    expect(tokenizeDependencies('avm-089 ')).toEqual({ tokens: ['avm-089'], pending: '' })
    expect(tokenizeDependencies('avm-089,')).toEqual({ tokens: ['avm-089'], pending: '' })
    expect(tokenizeDependencies('avm-089')).toEqual({ tokens: [], pending: 'avm-089' })
  })

  it('supports multiple tokens in pasted input without losing the unfinished ID', () => {
    expect(tokenizeDependencies('avm-001, avm-004 avm-084')).toEqual({
      tokens: ['avm-001', 'avm-004'], pending: 'avm-084'
    })
    expect(tokenizeDependencies('avm-001, avm-004 avm-084', true)).toEqual({
      tokens: ['avm-001', 'avm-004', 'avm-084'], pending: ''
    })
    expect(tokenizeDependencies('  avm-001,,  avm-004\n')).toEqual({
      tokens: ['avm-001', 'avm-004'], pending: ''
    })
    expect(tokenizeDependencies(' , \t ')).toEqual({ tokens: [], pending: '' })
  })

  it('does not insert empty entries or duplicate IDs', () => {
    const existing = ['avm-001', 'avm-004']
    const parsed = tokenizeDependencies('avm-001, avm-084, avm-084 ')
    expect(mergeDependencyTags(existing, parsed.tokens)).toEqual([
      'avm-001', 'avm-004', 'avm-084'
    ])
    expect(existing).toEqual(['avm-001', 'avm-004'])
    expect(mergeDependencyTags(existing, [' ', 'avm-004'])).toEqual(existing)
    expect(() => mergeDependencyTags(existing, ['avm-005, avm-006'])).toThrow()
  })

  it('removes only the selected chip, preserving order and even imported duplicates', () => {
    const deps = ['avm-001', 'avm-004', 'avm-001']
    expect(removeDependencyTag(deps, 1)).toEqual(['avm-001', 'avm-001'])
    expect(removeDependencyTag(deps, 2)).toEqual(['avm-001', 'avm-004'])
    expect(deps).toEqual(['avm-001', 'avm-004', 'avm-001'])
    expect(() => removeDependencyTag(deps, -1)).toThrow(RangeError)
    expect(() => removeDependencyTag(deps, 3)).toThrow(RangeError)
  })

  it('preserves dependency capitalization and exact ticket IDs', () => {
    expect(mergeDependencyTags(['AVM-001'], ['avm-001', 'AVM-001']))
      .toEqual(['AVM-001', 'avm-001'])
  })
})
