import { randomUUID } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { WorkspaceDatabase } from './database'
import type {
  ImportResult, ProjectDocument, ProjectInput, ProjectRecord,
  SourceFormat, TicketLocation, TicketObject, TicketRecord
} from '../shared/contracts'
import { appendTicket, locateNode, removeNode, replaceNode } from '../shared/document-mutations'
import { collectTicketLocations, parseTicketSource } from '../shared/ticket-source'
import { validateTicket } from '../shared/ticket-validation'
import { applyBatchOperation, uniqueCopyId } from '../shared/batch-operations'
import type { BatchOperation } from '../shared/batch-operations'

type ProjectRow = {
  project_uuid: string
  name: string
  root_path: string
  ticket_count: number
}
type TicketRow = {
  ticket_uuid: string
  project_uuid: string
  ticket_id: string
  sequence_index: number
  json_pointer: string
  payload_json: string
}
type DocumentRow = {
  project_uuid: string
  source_format: SourceFormat
  document_json: string
}

function ensureUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/iu.test(value)) throw new Error('Invalid record UUID')
  return value
}

function normalizeProject(input: ProjectInput): ProjectInput {
  if (typeof input?.name !== 'string' || !input.name.trim()) throw new Error('Project name is required')
  if (typeof input.rootPath !== 'string' || !isAbsolute(input.rootPath)) {
    throw new Error('Select an absolute project directory')
  }
  const rootPath = realpathSync.native(input.rootPath)
  if (!statSync(rootPath).isDirectory()) throw new Error('Project path must be a directory')
  return { name: input.name.trim(), rootPath }
}

function projectToRecord(row: ProjectRow): ProjectRecord {
  return {
    projectUuid: row.project_uuid,
    name: row.name,
    rootPath: row.root_path,
    ticketCount: row.ticket_count
  }
}

function requireProject(db: WorkspaceDatabase, projectUuid: string): void {
  ensureUuid(projectUuid)
  const result = db.prepare('SELECT 1 FROM projects WHERE project_uuid = ?').get(projectUuid)
  if (!result) throw new Error('Project not found')
}

function requireDocument(db: WorkspaceDatabase, projectUuid: string): DocumentRow {
  requireProject(db, projectUuid)
  const row = db.prepare('SELECT * FROM documents WHERE project_uuid = ?').get(projectUuid) as DocumentRow | undefined
  if (!row) throw new Error('Project document missing')
  return row
}

export function listProjects(db: WorkspaceDatabase): ProjectRecord[] {
  const rows = db.prepare(
    'SELECT p.project_uuid, p.name, p.root_path, COUNT(t.ticket_uuid) AS ticket_count ' +
    'FROM projects p LEFT JOIN tickets t ON t.project_uuid = p.project_uuid ' +
    'GROUP BY p.project_uuid ORDER BY p.name COLLATE NOCASE, p.project_uuid'
  ).all() as ProjectRow[]
  return rows.map(projectToRecord)
}

export function registerProject(db: WorkspaceDatabase, input: ProjectInput): ProjectRecord {
  const normalized = normalizeProject(input)
  const projectUuid = randomUUID()
  db.transaction(() => {
    db.prepare('INSERT INTO projects (project_uuid, name, root_path) VALUES (?, ?, ?)')
      .run(projectUuid, normalized.name, normalized.rootPath)
    db.prepare('INSERT INTO documents (project_uuid, source_format, document_json) VALUES (?, ?, ?)')
      .run(projectUuid, 'json', '[]')
  })()
  return listProjects(db).find(p => p.projectUuid === projectUuid)!
}

export function updateProject(db: WorkspaceDatabase, projectUuid: string, input: ProjectInput): ProjectRecord {
  requireProject(db, projectUuid)
  const normalized = normalizeProject(input)
  const sync = db.prepare('SELECT status FROM sync_state WHERE project_uuid = ?')
    .get(projectUuid) as { status: string } | undefined
  if (sync?.status === 'linked') throw new Error('Disconnect the existing .tickets link before moving the project')
  db.prepare('UPDATE projects SET name = ?, root_path = ?, updated_at = CURRENT_TIMESTAMP WHERE project_uuid = ?')
    .run(normalized.name, normalized.rootPath, projectUuid)
  return listProjects(db).find(p => p.projectUuid === projectUuid)!
}

export function removeProject(db: WorkspaceDatabase, projectUuid: string): void {
  requireProject(db, projectUuid)
  db.prepare('DELETE FROM projects WHERE project_uuid = ?').run(projectUuid)
  // Removing a registration does not delete files from the project directory.
}

function rowsForProject(db: WorkspaceDatabase, projectUuid: string): TicketRow[] {
  return db.prepare('SELECT * FROM tickets WHERE project_uuid = ? ORDER BY sequence_index')
    .all(projectUuid) as TicketRow[]
}

function rowToTicket(row: TicketRow): TicketRecord {
  const payload = JSON.parse(row.payload_json) as TicketObject
  return {
    ticketUuid: row.ticket_uuid,
    projectUuid: row.project_uuid,
    ticketId: row.ticket_id,
    number: row.sequence_index + 1,
    pointer: row.json_pointer,
    payload,
    validation: validateTicket(payload)
  }
}

export function listTickets(db: WorkspaceDatabase, projectUuid: string): TicketRecord[] {
  requireProject(db, projectUuid)
  return rowsForProject(db, projectUuid).map(rowToTicket)
}

export function getProjectDocument(db: WorkspaceDatabase, projectUuid: string): ProjectDocument {
  const row = requireDocument(db, projectUuid)
  return {
    projectUuid,
    sourceFormat: row.source_format,
    document: JSON.parse(row.document_json) as unknown
  }
}

function ticketRow(db: WorkspaceDatabase, projectUuid: string, ticketUuid: string): TicketRow {
  ensureUuid(ticketUuid)
  const row = db.prepare('SELECT * FROM tickets WHERE project_uuid = ? AND ticket_uuid = ?')
    .get(projectUuid, ticketUuid) as TicketRow | undefined
  if (!row) throw new Error('Ticket not found')
  return row
}

function chooseIdentity(location: TicketLocation, rows: TicketRow[], reserved: Set<string>): string {
  const atSamePosition = rows.find(row => row.json_pointer === location.pointer && row.ticket_id === location.ticketId && !reserved.has(row.ticket_uuid))
  if (atSamePosition) return atSamePosition.ticket_uuid
  const byId = rows.filter(row => row.ticket_id === location.ticketId && !reserved.has(row.ticket_uuid))
  if (byId.length === 1) return byId[0].ticket_uuid
  const atPosition = rows.find(row => row.json_pointer === location.pointer && !reserved.has(row.ticket_uuid))
  return atPosition?.ticket_uuid ?? randomUUID()
}

function persistDocument(db: WorkspaceDatabase, projectUuid: string, root: unknown, format: SourceFormat): void {
  const encoded = JSON.stringify(root)
  if (encoded === undefined) throw new Error('Document cannot be serialized as JSON')
  const locations = collectTicketLocations(root)
  const rows = rowsForProject(db, projectUuid)
  const reserved = new Set<string>()
  const identities = locations.map(location => {
    const uuid = chooseIdentity(location, rows, reserved)
    reserved.add(uuid)
    return uuid
  })

  // Stage existing pointers first so shifted array indices cannot violate the unique pointer index.
  const stage = db.prepare('UPDATE tickets SET json_pointer = ? WHERE ticket_uuid = ?')
  for (const row of rows) stage.run('__staged__/' + row.ticket_uuid, row.ticket_uuid)

  const remove = db.prepare('DELETE FROM tickets WHERE ticket_uuid = ?')
  for (const row of rows) {
    if (!reserved.has(row.ticket_uuid)) remove.run(row.ticket_uuid)
  }

  const update = db.prepare(
    'UPDATE tickets SET ticket_id = ?, sequence_index = ?, json_pointer = ?, payload_json = ?, ' +
    'updated_at = CURRENT_TIMESTAMP WHERE ticket_uuid = ?'
  )
  const insert = db.prepare(
    'INSERT INTO tickets (ticket_uuid, project_uuid, ticket_id, sequence_index, json_pointer, payload_json) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const existing = new Set(rows.map(row => row.ticket_uuid))
  locations.forEach((location, index) => {
    const payload = locateNode(root, location.path)
    const payloadJson = JSON.stringify(payload)
    if (existing.has(identities[index])) {
      update.run(location.ticketId, index, location.pointer, payloadJson, identities[index])
    } else {
      insert.run(identities[index], projectUuid, location.ticketId, index, location.pointer, payloadJson)
    }
  })
  db.prepare('UPDATE documents SET source_format = ?, document_json = ?, updated_at = CURRENT_TIMESTAMP WHERE project_uuid = ?')
    .run(format, encoded, projectUuid)
  db.prepare('INSERT INTO revisions (project_uuid, snapshot_json) VALUES (?, ?)')
    .run(projectUuid, encoded)
}

export function replaceProjectDocument(
  db: WorkspaceDatabase,
  projectUuid: string,
  source: string,
  format: SourceFormat
): ImportResult {
  requireDocument(db, projectUuid)
  if (format !== 'json' && format !== 'jsonl') throw new Error('Unsupported format')
  const root = parseTicketSource(source, format)
  if (root === null || typeof root !== 'object') throw new Error('Document root must be a JSON array or object')
  db.transaction(() => persistDocument(db, projectUuid, root, format))()
  return { ticketCount: collectTicketLocations(root).length, sourceFormat: format }
}

function updateRoot(db: WorkspaceDatabase, projectUuid: string, action: (root: unknown) => unknown): void {
  db.transaction(() => {
    const doc = requireDocument(db, projectUuid)
    const root = action(JSON.parse(doc.document_json) as unknown)
    persistDocument(db, projectUuid, root, doc.source_format)
  })()
}

export function createTicket(db: WorkspaceDatabase, projectUuid: string): TicketRecord {
  const before = listTickets(db, projectUuid)
  updateRoot(db, projectUuid, root => appendTicket(root, before[0] ? findLocation(root, before[0].pointer) : null))
  const after = listTickets(db, projectUuid)
  const created = after.find(row => !before.some(old => old.ticketUuid === row.ticketUuid))
  if (!created) throw new Error('New ticket was not indexed')
  return created
}

function findLocation(root: unknown, pointer: string): Array<string | number> {
  const location = collectTicketLocations(root).find(item => item.pointer === pointer)
  if (!location) throw new Error('Ticket location no longer exists')
  return location.path
}

export function updateTicket(
  db: WorkspaceDatabase,
  projectUuid: string,
  ticketUuid: string,
  payload: TicketObject
): TicketRecord {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Ticket must be a JSON object')
  }
  if (typeof payload.id !== 'string' || !payload.id.trim()) throw new Error('Ticket ID is required')
  const before = ticketRow(db, projectUuid, ticketUuid)
  updateRoot(db, projectUuid, root => replaceNode(root, findLocation(root, before.json_pointer), payload))
  const updated = rowsForProject(db, projectUuid).find(row => row.ticket_uuid === ticketUuid)
  if (!updated) throw new Error('Updated ticket was not indexed')
  return rowToTicket(updated)
}

export function deleteTicket(db: WorkspaceDatabase, projectUuid: string, ticketUuid: string): void {
  const before = ticketRow(db, projectUuid, ticketUuid)
  updateRoot(db, projectUuid, root => removeNode(root, findLocation(root, before.json_pointer)))
}

function resolveTickets(db: WorkspaceDatabase, projectUuid: string, ids: string[]): TicketRow[] {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
    throw new Error('Select between 1 and 500 tickets')
  }
  if (new Set(ids).size !== ids.length) throw new Error('Repeated ticket selection')
  return ids.map(id => ticketRow(db, projectUuid, id))
}

export function applyBatchToTickets(
  db: WorkspaceDatabase, projectUuid: string, ids: string[], operation: BatchOperation
): number {
  const selected = resolveTickets(db, projectUuid, ids)
  updateRoot(db, projectUuid, root => {
    const known = collectTicketLocations(root)
    for (const row of selected) {
      const location = known.find(item => item.pointer === row.json_pointer)
      if (!location) throw new Error('Ticket location was removed before batch edit')
      const current = locateNode(root, location.path)
      if (!current || Array.isArray(current) || typeof current !== 'object') throw new Error('Invalid ticket location')
      replaceNode(root, location.path, applyBatchOperation(current as TicketObject, operation))
    }
    return root
  })
  return selected.length
}

export function duplicateTickets(db: WorkspaceDatabase, projectUuid: string, ids: string[]): number {
  const selected = resolveTickets(db, projectUuid, ids)
  updateRoot(db, projectUuid, root => {
    const locations = collectTicketLocations(root)
    const used = new Set(locations.map(item => item.ticketId))
    const resolved = selected.map(row => {
      const location = locations.find(item => item.pointer === row.json_pointer)
      if (!location || location.path.length === 0) throw new Error('Cannot duplicate a root object ticket')
      const index = location.path[location.path.length - 1]
      const parent = locateNode(root, location.path.slice(0, -1))
      if (!Array.isArray(parent) || typeof index !== 'number') {
        throw new Error('Tickets must belong to an array to duplicate')
      }
      return { parent, index }
    })
    // Descending indices prevent insertions from shifting yet-to-be-duplicated tickets.
    for (const { parent, index } of resolved.sort((a, b) => b.index - a.index)) {
      const copy = structuredClone(parent[index]) as TicketObject
      copy.id = uniqueCopyId(String(copy.id), used)
      parent.splice(index + 1, 0, copy)
    }
    return root
  })
  return selected.length
}

export function moveTickets(
  db: WorkspaceDatabase, projectUuid: string, ids: string[], direction: 'up' | 'down'
): number {
  if (direction !== 'up' && direction !== 'down') throw new Error('Invalid move direction')
  const selected = resolveTickets(db, projectUuid, ids)
  updateRoot(db, projectUuid, root => {
    const locations = collectTicketLocations(root)
    const groups = new Map<string, { parent: unknown[]; indexes: Set<number> }>()
    for (const row of selected) {
      const location = locations.find(item => item.pointer === row.json_pointer)
      if (!location || location.path.length === 0) throw new Error('Only tickets in arrays can be reordered')
      const path = location.path.slice(0, -1)
      const index = location.path[location.path.length - 1]
      const parent = locateNode(root, path)
      if (!Array.isArray(parent) || typeof index !== 'number') throw new Error('Only tickets in arrays can be reordered')
      const key = JSON.stringify(path)
      if (!groups.has(key)) groups.set(key, { parent, indexes: new Set() })
      groups.get(key)!.indexes.add(index)
    }
    for (const { parent, indexes } of groups.values()) {
      const indices = direction === 'up'
        ? Array.from({ length: parent.length }, (_, i) => i).slice(1)
        : Array.from({ length: parent.length }, (_, i) => i).slice(0, -1).reverse()
      for (const i of indices) {
        const neighbor = direction === 'up' ? i - 1 : i + 1
        if (!indexes.has(i) || indexes.has(neighbor)) continue
        ;[parent[i], parent[neighbor]] = [parent[neighbor], parent[i]]
        indexes.delete(i)
        indexes.add(neighbor)
      }
    }
    return root
  })
  return selected.length
}

export function deleteSelectedTickets(db: WorkspaceDatabase, projectUuid: string, ids: string[]): number {
  const selected = resolveTickets(db, projectUuid, ids)
  updateRoot(db, projectUuid, root => {
    const known = collectTicketLocations(root)
    const positions = selected.map(row => {
      const location = known.find(item => item.pointer === row.json_pointer)
      if (!location) throw new Error('Ticket location was removed before deletion')
      return location.path
    })
    // Delete array elements from higher indices so earlier locations remain valid.
    positions.sort((a, b) => {
      const aParent = JSON.stringify(a.slice(0, -1))
      const bParent = JSON.stringify(b.slice(0, -1))
      if (aParent !== bParent) return bParent.localeCompare(aParent)
      const ai = a[a.length - 1]
      const bi = b[b.length - 1]
      return typeof ai === 'number' && typeof bi === 'number' ? bi - ai : 0
    })
    for (const path of positions) root = removeNode(root, path)
    return root
  })
  return selected.length
}
