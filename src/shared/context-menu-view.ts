import type { ContextAction, ContextMenuEntry, ContextEditRole } from './context-menu'

export type ContextGlyph =
  | 'open' | 'copy' | 'file-code' | 'download' | 'duplicate' | 'arrow-up'
  | 'arrow-down' | 'edit' | 'trash' | 'folder' | 'settings' | 'folder-path'
  | 'upload' | 'close' | 'play' | 'pin-off' | 'arrow-left' | 'arrow-right'
  | 'sliders' | 'plus' | 'select-all' | 'clear' | 'undo' | 'redo'
  | 'cut' | 'paste' | 'code' | 'external-link'

/**
 * 24×24 vector paths, with an icon specified for every context action.
 * The icon column is decorative: the complete accessible action name is text.
 */
export const contextGlyphPaths: Record<ContextGlyph, string> = {
  open: 'M4 4h16v16H4z M8 12h9 m-4-4 4 4-4 4',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  'file-code': 'M13 3H5v18h14V9z M13 3v6h6 M10 13l-2 2 2 2 m4-4 2 2-2 2',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 18v3h16v-3',
  duplicate: 'M8 3h12v14H8z M4 7H2v14h14v-2',
  'arrow-up': 'M12 20V4 m-6 6 6-6 6 6',
  'arrow-down': 'M12 4v16 m-6-6 6 6 6-6',
  edit: 'M4 20h5l11-11-5-5L4 15z M13 6l5 5',
  trash: 'M4 7h16 M10 4h4 M7 7l1 14h8l1-14 M10 11v6 m4-6v6',
  folder: 'M3 6h7l2 2h9v12H3z',
  settings: 'M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.5 1.5 m9.8 9.8 1.5 1.5 M18.4 5.6l-1.5 1.5 m-9.8 9.8-1.5 1.5 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  'folder-path': 'M3 6h7l2 2h9v12H3z M7 13h9 M7 17h5',
  upload: 'M12 17V3 m-5 5 5-5 5 5 M4 16v5h16v-5',
  close: 'M5 5l14 14 M19 5 5 19',
  play: 'M7 4v16l13-8z',
  'pin-off': 'M4 4l16 16 M10 4h8l-2 4 3 3v2h-5 M9 13H5v-2l3-3-1-4 M12 13v8',
  'arrow-left': 'M20 12H4 m6-6-6 6 6 6',
  'arrow-right': 'M4 12h16 m-6-6 6 6-6 6',
  sliders: 'M4 7h8 M17 7h3 M4 17h3 M12 17h8 M14 4v6 M9 14v6',
  plus: 'M12 4v16 M4 12h16',
  'select-all': 'M4 8V4h4 m8 0h4v4 M20 16v4h-4 M8 20H4v-4 M8 12l3 3 5-6',
  clear: 'M4 4h16v16H4z M8 8l8 8 m0-8-8 8',
  undo: 'M9 7 4 12l5 5 M4 12h10a6 6 0 0 1 6 6',
  redo: 'M15 7l5 5-5 5 M20 12H10a6 6 0 0 0-6 6',
  cut: 'M5 5l14 14 M14 8l5-5 M5 19l8-8 M6 6a2 2 0 1 0-4 0 2 2 0 0 0 4 0 M6 18a2 2 0 1 0-4 0 2 2 0 0 0 4 0',
  paste: 'M8 5h12v16H8z M10 3h8v4h-8z M12 12h4 m-4 4h4',
  code: 'M8 8l-4 4 4 4 m8-8 4 4-4 4 M14 5l-4 14',
  'external-link': 'M13 5h6v6 M19 5l-9 9 M17 13v6H5V7h6'
}

const actionIcons: Record<ContextAction, ContextGlyph> = {
  'ticket.open': 'open',
  'ticket.copyId': 'copy',
  'ticket.copy': 'file-code',
  'ticket.export': 'download',
  'ticket.duplicate': 'duplicate',
  'ticket.moveUp': 'arrow-up',
  'ticket.moveDown': 'arrow-down',
  'ticket.batchEdit': 'edit',
  'ticket.delete': 'trash',
  'project.switch': 'folder',
  'project.settings': 'settings',
  'project.copyPath': 'folder-path',
  'project.copy': 'file-code',
  'project.export': 'download',
  'project.import': 'upload',
  'project.unregister': 'trash',
  'pin.run': 'play',
  'pin.unpin': 'pin-off',
  'pin.moveLeft': 'arrow-left',
  'pin.moveRight': 'arrow-right',
  'pin.customize': 'sliders',
  'list.new': 'plus',
  'list.import': 'upload',
  'list.selectVisible': 'select-all',
  'list.clearSelection': 'clear',
  'json.undo': 'undo',
  'json.redo': 'redo',
  'json.cut': 'cut',
  'json.copy': 'copy',
  'json.paste': 'paste',
  'json.selectAll': 'select-all',
  'json.format': 'code',
  'dependency.copy': 'copy',
  'dependency.remove': 'close'
}

const roleIcons: Record<ContextEditRole, ContextGlyph> = {
  undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy', paste: 'paste',
  selectAll: 'select-all'
}

const roleLabels: Record<ContextEditRole, string> = {
  undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy',
  paste: 'Paste', selectAll: 'Select all'
}

export function contextEntryIcon(entry: ContextMenuEntry): ContextGlyph | null {
  if (entry.kind === 'separator') return null
  return entry.kind === 'action' ? actionIcons[entry.action] : roleIcons[entry.role]
}

export function contextEntryLabel(entry: ContextMenuEntry): string {
  if (entry.kind === 'separator') return ''
  return entry.kind === 'action' ? entry.label : roleLabels[entry.role]
}

export function destructiveContextEntry(entry: ContextMenuEntry): boolean {
  return entry.kind === 'action' &&
    ['ticket.delete', 'project.unregister', 'dependency.remove'].includes(entry.action)
}

/** Keep the complete rectangular menu inside the viewport, including on narrow screens. */
export function fitContextMenu(
  x: number, y: number, viewportWidth: number, viewportHeight: number,
  menuWidth: number, menuHeight: number, gutter = 8
): { left: number; top: number } {
  const leftMax = Math.max(gutter, viewportWidth - menuWidth - gutter)
  const topMax = Math.max(gutter, viewportHeight - menuHeight - gutter)
  return {
    left: Math.max(gutter, Math.min(x, leftMax)),
    top: Math.max(gutter, Math.min(y, topMax))
  }
}

/** Roving focus skips separators and disabled commands, wrapping at both ends. */
export function nextContextMenuIndex(
  items: readonly ContextMenuEntry[], current: number, direction: 1 | -1
): number {
  if (!items.length) return -1
  for (let step = 1; step <= items.length; step++) {
    const index = (current + direction * step + items.length * 2) % items.length
    if (items[index].kind !== 'separator' && items[index].enabled !== false) {
      return index
    }
  }
  return -1
}

export function firstContextMenuIndex(items: readonly ContextMenuEntry[]): number {
  return items.findIndex(item => item.kind !== 'separator' && item.enabled !== false)
}
