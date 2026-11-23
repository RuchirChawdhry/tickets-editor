import { describe, expect, it } from 'vitest'
import type { ContextMenuEntry } from './context-menu'
import {
  contextEntryIcon, contextEntryLabel, contextGlyphPaths, destructiveContextEntry,
  firstContextMenuIndex, fitContextMenu, nextContextMenuIndex
} from './context-menu-view'
import { contextActions } from './context-menu'

const items: ContextMenuEntry[] = [
  { kind: 'action', action: 'ticket.open', label: 'Open ticket', enabled: true },
  { kind: 'separator' },
  { kind: 'action', action: 'ticket.copyId', label: 'Copy ID', enabled: false },
  { kind: 'action', action: 'ticket.delete', label: 'Delete ticket', enabled: true },
]

describe('square context menu rendering contracts', () => {
  it('provides a meaningful, valid vector icon for every menu action', () => {
    for (const action of contextActions) {
      const icon = contextEntryIcon({ kind: 'action', action, label: action })
      expect(icon, action).not.toBeNull()
      expect(contextGlyphPaths[icon!].length, action).toBeGreaterThan(10)
    }
    for (const role of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const) {
      const icon = contextEntryIcon({ kind: 'role', role })
      expect(contextGlyphPaths[icon!]).toBeTruthy()
      expect(contextEntryLabel({ kind: 'role', role })).toMatch(/\S/)
    }
    expect(contextEntryIcon({ kind: 'separator' })).toBeNull()
    expect(contextEntryLabel({ kind: 'separator' })).toBe('')
  })

  it('separately identifies dangerous actions for high-contrast icon treatment', () => {
    expect(destructiveContextEntry(items[3])).toBe(true)
    expect(destructiveContextEntry(items[0])).toBe(false)
    expect(destructiveContextEntry({ kind: 'role', role: 'cut' })).toBe(false)
  })

  it('keeps the menu within the viewport at all four edges', () => {
    expect(fitContextMenu(8, 8, 1200, 800, 280, 300)).toEqual({ left: 8, top: 8 })
    expect(fitContextMenu(1190, 790, 1200, 800, 280, 300))
      .toEqual({ left: 912, top: 492 })
    expect(fitContextMenu(-50, -100, 1200, 800, 280, 300))
      .toEqual({ left: 8, top: 8 })
    expect(fitContextMenu(100, 120, 250, 220, 230, 210))
      .toEqual({ left: 12, top: 8 })
  })

  it('skips disabled entries and separators with accessible keyboard navigation', () => {
    expect(firstContextMenuIndex(items)).toBe(0)
    expect(nextContextMenuIndex(items, 0, 1)).toBe(3)
    expect(nextContextMenuIndex(items, 3, 1)).toBe(0)
    expect(nextContextMenuIndex(items, 0, -1)).toBe(3)
    expect(nextContextMenuIndex(items, -1, 1)).toBe(0)
    expect(firstContextMenuIndex([{ kind: 'separator' }])).toBe(-1)
    expect(nextContextMenuIndex([{ kind: 'separator' }], 0, 1)).toBe(-1)
  })
})
