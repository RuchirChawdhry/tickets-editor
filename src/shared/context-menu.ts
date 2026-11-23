/**
 * Desktop context-menu contracts. A single, allowlisted action vocabulary is
 * shared by the renderer and the main-process native Menu IPC.
 */
export const contextActions = [
  'ticket.open', 'ticket.copyId', 'ticket.copy', 'ticket.export',
  'ticket.duplicate', 'ticket.moveUp', 'ticket.moveDown',
  'ticket.batchEdit', 'ticket.delete',
  'project.switch', 'project.settings', 'project.copyPath',
  'project.copy', 'project.export', 'project.import', 'project.unregister',
  'pin.run', 'pin.unpin', 'pin.moveLeft', 'pin.moveRight', 'pin.customize',
  'list.new', 'list.import', 'list.selectVisible', 'list.clearSelection',
  'json.undo', 'json.redo', 'json.cut', 'json.copy', 'json.paste',
  'json.selectAll', 'json.format',
  'dependency.copy', 'dependency.remove'
] as const

export type ContextAction = (typeof contextActions)[number]
export type ContextEditRole = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'

export type ContextMenuEntry =
  | { kind: 'separator' }
  | { kind: 'action'; action: ContextAction; label: string; enabled?: boolean }
  | { kind: 'role'; role: ContextEditRole; enabled?: boolean }

export interface ContextMenuRequest {
  items: ContextMenuEntry[]
  x?: number
  y?: number
}

const actionNames = new Set<string>(contextActions)
const editRoles = new Set<string>(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])

export function parseContextEditRole(value: unknown): ContextEditRole {
  if (typeof value !== 'string' || !editRoles.has(value)) {
    throw new TypeError('Unknown editing role')
  }
  return value as ContextEditRole
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitizeLabel(text: string): string {
  return Array.from(text, character => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
}

function hasControlCharacters(text: string): boolean {
  return sanitizeLabel(text) !== text
}

/** No arbitrary IPC menu commands, callbacks, or executable content allowed. */
export function parseContextMenuRequest(value: unknown): ContextMenuRequest {
  if (!object(value) || !Array.isArray(value.items) ||
    value.items.length === 0 || value.items.length > 32) {
    throw new TypeError('Invalid context-menu request')
  }
  const items: ContextMenuEntry[] = value.items.map((raw: unknown) => {
    if (!object(raw)) throw new TypeError('Invalid context-menu entry')
    if (raw.kind === 'separator') return { kind: 'separator' }
    if (raw.enabled !== undefined && typeof raw.enabled !== 'boolean') {
      throw new TypeError('Invalid context-menu enabled flag')
    }
    const enabled = raw.enabled === undefined ? true : raw.enabled
    if (raw.kind === 'role' && typeof raw.role === 'string' && editRoles.has(raw.role)) {
      return { kind: 'role', role: raw.role as ContextEditRole, enabled }
    }
    if (raw.kind === 'action' && typeof raw.action === 'string' &&
      actionNames.has(raw.action) && typeof raw.label === 'string' &&
      raw.label.length > 0 && raw.label.length <= 100 &&
      !hasControlCharacters(raw.label)) {
      return {
        kind: 'action', action: raw.action as ContextAction,
        label: raw.label, enabled
      }
    }
    throw new TypeError('Unknown or unsafe context-menu entry')
  })

  const result: ContextMenuRequest = { items }
  if (value.x !== undefined || value.y !== undefined) {
    if (typeof value.x !== 'number' || !Number.isFinite(value.x) ||
      typeof value.y !== 'number' || !Number.isFinite(value.y)) {
      throw new TypeError('Invalid context-menu coordinates')
    }
    result.x = Math.round(value.x)
    result.y = Math.round(value.y)
  }
  return result
}

const item = (action: ContextAction, label: string, enabled = true): ContextMenuEntry =>
  ({ kind: 'action', action, label, enabled })
const separator = (): ContextMenuEntry => ({ kind: 'separator' })

/**
 * Right-click does NOT open a different ticket or discard unsaved drafts.
 * Existing multi-selection is preserved only when clicking within it.
 */
export function contextTicketSelection(
  clickedUuid: string, selectedUuids: readonly string[]
): string[] {
  return selectedUuids.includes(clickedUuid)
    ? [...selectedUuids]
    : [clickedUuid]
}

export function ticketContextItems(count: number, busy: boolean): ContextMenuEntry[] {
  const plural = count === 1 ? 'ticket' : 'tickets'
  return [
    item('ticket.open', 'Open ticket', !busy),
    item('ticket.copyId', 'Copy ticket ID'),
    separator(),
    item('ticket.copy', count === 1 ? 'Copy ticket JSON' : `Copy ${count} tickets as JSON`, !busy),
    item('ticket.export', `Export ${count} ${plural}…`, !busy),
    separator(),
    item('ticket.duplicate', `Duplicate ${count} ${plural}`, !busy),
    item('ticket.moveUp', 'Move up', !busy),
    item('ticket.moveDown', 'Move down', !busy),
    item('ticket.batchEdit', 'Batch edit…', !busy),
    separator(),
    item('ticket.delete', `Delete ${count} ${plural}…`, !busy)
  ]
}

export function projectContextItems(active: boolean, busy: boolean): ContextMenuEntry[] {
  return [
    item('project.switch', 'Switch to project', !active && !busy),
    item('project.settings', 'Project settings…', !busy),
    separator(),
    item('project.copyPath', 'Copy project path'),
    item('project.copy', 'Copy project JSON', !busy),
    item('project.export', 'Export project…', !busy),
    item('project.import', 'Import JSON/JSONL…', !busy),
    separator(),
    item('project.unregister', 'Unregister project…', !busy)
  ]
}

export function pinContextItems(title: string, enabled: boolean,
  index: number, total: number): ContextMenuEntry[] {
  const safeTitle = sanitizeLabel(title.slice(0, 65))
  return [
    item('pin.run', `Run ${safeTitle}`, enabled),
    separator(),
    item('pin.unpin', 'Unpin command'),
    item('pin.moveLeft', 'Move left', index > 0),
    item('pin.moveRight', 'Move right', index < total - 1),
    separator(),
    item('pin.customize', 'Customize title bar…')
  ]
}

export function listContextItems(hasProject: boolean, busy: boolean,
  selectedCount: number): ContextMenuEntry[] {
  return [
    item('list.new', 'New ticket', hasProject && !busy),
    item('list.import', 'Import JSON/JSONL…', hasProject && !busy),
    separator(),
    item('list.selectVisible', 'Select visible tickets', hasProject && !busy),
    item('list.clearSelection', 'Clear selection', selectedCount > 0),
  ]
}

export function jsonContextItems(canUndo: boolean, canRedo: boolean,
  hasSelection: boolean, canFormat: boolean): ContextMenuEntry[] {
  return [
    item('json.undo', 'Undo', canUndo),
    item('json.redo', 'Redo', canRedo),
    separator(),
    item('json.cut', 'Cut', hasSelection),
    item('json.copy', 'Copy', hasSelection),
    item('json.paste', 'Paste'),
    separator(),
    item('json.selectAll', 'Select all'),
    item('json.format', 'Format JSON', canFormat)
  ]
}

export function formTextContextItems(canUndo: boolean, canRedo: boolean): ContextMenuEntry[] {
  return [
    item('json.undo', 'Undo ticket edit', canUndo),
    item('json.redo', 'Redo ticket edit', canRedo),
    separator(),
    { kind: 'role', role: 'cut' }, { kind: 'role', role: 'copy' },
    { kind: 'role', role: 'paste' },
    separator(),
    { kind: 'role', role: 'selectAll' }
  ]
}

export function nativeTextContextItems(): ContextMenuEntry[] {
  return [
    { kind: 'role', role: 'undo' }, { kind: 'role', role: 'redo' },
    separator(),
    { kind: 'role', role: 'cut' }, { kind: 'role', role: 'copy' },
    { kind: 'role', role: 'paste' },
    separator(),
    { kind: 'role', role: 'selectAll' }
  ]
}

export function dependencyContextItems(canRemove: boolean): ContextMenuEntry[] {
  return [
    item('dependency.copy', 'Copy dependency ID'),
    item('dependency.remove', 'Remove dependency', canRemove)
  ]
}

export function selectionContextItems(): ContextMenuEntry[] {
  return [{ kind: 'role', role: 'copy' }]
}
