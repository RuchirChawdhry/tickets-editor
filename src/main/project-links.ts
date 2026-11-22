import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, readlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { WorkspaceDatabase } from './database'
import type { LinkMode, ProjectLinkStatus, RevisionRecord } from '../shared/contracts'
import { replaceProjectDocument } from './project-store'
import {
  canonicalTicketsPath, createProjectLink, ensureCanonical, fileExists,
  fileIdentity, projectTicketsPath, sha256, verifyFileLink, writeCanonicalInPlace
} from './link-files'

interface ProjectStorageRow {
  root_path: string
  document_json: string
  backing_path: string | null
  project_file_path: string | null
  link_type: LinkMode | null
  last_synced_sha256: string | null
  status: string | null
}

function storageRow(db: WorkspaceDatabase, projectUuid: string): ProjectStorageRow {
  const row = db.prepare(
    'SELECT p.root_path, d.document_json, s.backing_path, s.project_file_path, ' +
    's.link_type, s.last_synced_sha256, s.status ' +
    'FROM projects p JOIN documents d ON p.project_uuid = d.project_uuid ' +
    'LEFT JOIN sync_state s ON s.project_uuid = p.project_uuid WHERE p.project_uuid = ?'
  ).get(projectUuid) as ProjectStorageRow | undefined
  if (!row) throw new Error('Project not registered')
  return row
}

function paths(db: WorkspaceDatabase, userData: string, projectUuid: string) {
  const row = storageRow(db, projectUuid)
  return {
    row,
    canonical: canonicalTicketsPath(userData, projectUuid),
    projectFile: projectTicketsPath(row.root_path)
  }
}

function updateSync(
  db: WorkspaceDatabase,
  id: string,
  canonical: string,
  target: string,
  mode: LinkMode | null,
  hash: string,
  status: string
): void {
  db.prepare(
    'INSERT INTO sync_state (project_uuid, backing_path, project_file_path, link_type, ' +
    'last_synced_sha256, last_known_file_id, status, checked_at) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ' +
    'ON CONFLICT(project_uuid) DO UPDATE SET backing_path = excluded.backing_path, ' +
    'project_file_path = excluded.project_file_path, link_type = excluded.link_type, ' +
    'last_synced_sha256 = excluded.last_synced_sha256, ' +
    'last_known_file_id = excluded.last_known_file_id, ' +
    'status = excluded.status, checked_at = CURRENT_TIMESTAMP'
  ).run(id, canonical, target, mode, hash, fileIdentity(canonical), status)
}

function validDocument(source: string): void {
  const data: unknown = JSON.parse(source)
  if (data === null || typeof data !== 'object') throw new Error('External tickets must be a JSON array or object')
}

export function getProjectLinkStatus(db: WorkspaceDatabase, userData: string, projectUuid: string): ProjectLinkStatus {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  const basics = { projectUuid, mode: row.link_type, canonicalPath: canonical, projectFilePath: projectFile }
  if (!fileExists(canonical)) return {
    ...basics, health: 'broken', details: 'Application-data tickets.json is missing. Recover it from SQLite before editing.'
  }
  const linked = !row.link_type || verifyFileLink(projectFile, canonical, row.link_type)
  if (!linked) return {
    ...basics, health: 'broken', details: 'Project .tickets was replaced or disconnected. Back up and repair the link.'
  }

  const fileHash = sha256(readFileSync(canonical, 'utf8'))
  const sqliteHash = sha256(row.document_json)
  const previous = row.last_synced_sha256
  if (previous && sqliteHash !== previous && fileHash !== previous) return {
    ...basics, health: 'conflict', details: 'SQLite and tickets.json have diverged. Choose which version to keep.'
  }
  if (previous && sqliteHash !== previous) return {
    ...basics, health: 'conflict', details: 'SQLite contains changes not written to tickets.json. Retry synchronization.'
  }
  if (previous && fileHash !== previous) return {
    ...basics, health: 'changed', details: 'External changes detected in tickets.json. Import them before editing.'
  }
  return {
    ...basics,
    health: row.link_type ? 'linked' : 'unconfigured',
    details: row.link_type ? 'The .tickets link is healthy and synchronized.' : 'The application-data JSON is synchronized. No project link configured.'
  }
}

export function initializeProjectFile(db: WorkspaceDatabase, userData: string, projectUuid: string): void {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  ensureCanonical(canonical, row.document_json)
  updateSync(db, projectUuid, canonical, projectFile, null, sha256(row.document_json), 'unconfigured')
}

export function assertProjectFileUnchanged(db: WorkspaceDatabase, userData: string, projectUuid: string): void {
  const state = getProjectLinkStatus(db, userData, projectUuid)
  if (state.health !== 'linked' && state.health !== 'unconfigured') throw new Error(state.details)
}

export function syncProjectFile(db: WorkspaceDatabase, userData: string, projectUuid: string): void {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  if (!fileExists(canonical)) throw new Error('Canonical tickets.json missing; recover before syncing.')
  if (row.link_type && !verifyFileLink(projectFile, canonical, row.link_type)) {
    throw new Error('Project .tickets link is broken; repair it before syncing.')
  }
  // Compare with last accepted file hash; do not clobber an external edit between checking and writing.
  const current = sha256(readFileSync(canonical, 'utf8'))
  if (row.last_synced_sha256 && current !== row.last_synced_sha256) {
    throw new Error('External edits appeared during synchronization. Resolve conflict first.')
  }
  writeCanonicalInPlace(canonical, row.document_json)
  updateSync(db, projectUuid, canonical, projectFile, row.link_type, sha256(row.document_json),
    row.link_type ? 'linked' : 'unconfigured')
}

export function setupProjectLink(db: WorkspaceDatabase, userData: string, projectUuid: string, mode: LinkMode): ProjectLinkStatus {
  if (mode !== 'hardlink' && mode !== 'symlink') throw new Error('Choose a valid link mode')
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  if (row.link_type && row.link_type !== mode) throw new Error('Existing link mode differs. Repair or disconnect explicitly.')
  if (!row.link_type) {
    assertProjectFileUnchanged(db, userData, projectUuid)
    ensureCanonical(canonical, row.document_json)
  } else {
    const state = getProjectLinkStatus(db, userData, projectUuid)
    if (state.health !== 'linked') throw new Error(state.details)
  }
  createProjectLink(projectFile, canonical, mode)
  updateSync(db, projectUuid, canonical, projectFile, mode, sha256(readFileSync(canonical, 'utf8')), 'linked')
  return getProjectLinkStatus(db, userData, projectUuid)
}

function recoveryDirectory(userData: string, projectUuid: string): string {
  const path = join(userData, 'recovery', projectUuid)
  mkdirSync(path, { recursive: true })
  return path
}

function preserveRecovery(userData: string, projectUuid: string, label: string, contents: string): string {
  const path = join(recoveryDirectory(userData, projectUuid), Date.now() + '-' + randomUUID() + '-' + label)
  writeFileSync(path, contents, { encoding: 'utf8', flag: 'wx' })
  return path
}

export function listProjectRevisions(db: WorkspaceDatabase, projectUuid: string): RevisionRecord[] {
  storageRow(db, projectUuid)
  return db.prepare(
    'SELECT revision_id AS revisionId, created_at AS createdAt FROM revisions ' +
    'WHERE project_uuid = ? ORDER BY revision_id DESC LIMIT 100'
  ).all(projectUuid) as RevisionRecord[]
}

export function restoreProjectRevision(db: WorkspaceDatabase, userData: string, projectUuid: string, revisionId: number): void {
  assertProjectFileUnchanged(db, userData, projectUuid)
  if (!Number.isSafeInteger(revisionId) || revisionId < 1) throw new Error('Invalid revision')
  const result = db.prepare('SELECT snapshot_json FROM revisions WHERE project_uuid = ? AND revision_id = ?')
    .get(projectUuid, revisionId) as { snapshot_json: string } | undefined
  if (!result) throw new Error('Revision not found')
  const current = storageRow(db, projectUuid).document_json
  // Preserve current state before restoring, so the restore itself is reversible.
  db.prepare('INSERT INTO revisions (project_uuid, snapshot_json) VALUES (?, ?)').run(projectUuid, current)
  replaceProjectDocument(db, projectUuid, result.snapshot_json, 'json')
  syncProjectFile(db, userData, projectUuid)
}

export function importExternalProjectFile(
  db: WorkspaceDatabase, userData: string, projectUuid: string, source: 'canonical' | 'detached'
): void {
  const { canonical, projectFile, row } = paths(db, userData, projectUuid)
  const state = getProjectLinkStatus(db, userData, projectUuid)
  if (source === 'canonical' && state.health !== 'changed' && state.health !== 'conflict') {
    throw new Error('No external application-data JSON changes to import')
  }
  if (source === 'detached' && (state.health !== 'broken' || !fileExists(projectFile))) {
    throw new Error('No detached .tickets file to import')
  }
  const text = readFileSync(source === 'detached' ? projectFile : canonical, 'utf8')
  validDocument(text)
  // Preserve both sides before an explicit import.
  preserveRecovery(userData, projectUuid, 'sqlite.json', row.document_json)
  preserveRecovery(userData, projectUuid, 'external.json', text)
  replaceProjectDocument(db, projectUuid, text, 'json')
  if (source === 'canonical') {
    updateSync(db, projectUuid, canonical, projectFile, row.link_type, sha256(text),
      row.link_type ? 'linked' : 'unconfigured')
  }
  // For detached imports, repair must be run next; do not touch the detached file yet.
}

export function recoverCanonicalFromSqlite(db: WorkspaceDatabase, userData: string, projectUuid: string): void {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  if (fileExists(canonical)) {
    const current = readFileSync(canonical, 'utf8')
    if (sha256(current) !== row.last_synced_sha256) {
      preserveRecovery(userData, projectUuid, 'canonical.json', current)
    }
  }
  preserveRecovery(userData, projectUuid, 'sqlite.json', row.document_json)
  writeCanonicalInPlace(canonical, row.document_json)
  // Restore status only when the configured project link is still valid.
  const isLinked = !!row.link_type && verifyFileLink(projectFile, canonical, row.link_type)
  updateSync(db, projectUuid, canonical, projectFile, row.link_type, sha256(row.document_json),
    isLinked ? 'linked' : row.link_type ? 'broken' : 'unconfigured')
}

export function repairProjectLink(db: WorkspaceDatabase, userData: string, projectUuid: string): ProjectLinkStatus {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  if (!row.link_type) throw new Error('Project link not configured. Use Set Up Link.')
  const state = getProjectLinkStatus(db, userData, projectUuid)
  if (state.health !== 'broken') throw new Error('Link is not broken')
  if (!fileExists(canonical)) throw new Error('Recover the canonical application-data JSON before repairing the link')
  if (sha256(readFileSync(canonical, 'utf8')) !== sha256(row.document_json)) {
    throw new Error('Canonical JSON and SQLite differ. Resolve the conflict first.')
  }
  if (fileExists(projectFile)) {
    const info = lstatSync(projectFile)
    if (info.isDirectory()) throw new Error('Cannot replace a directory named .tickets')
    const backup = info.isSymbolicLink()
      ? JSON.stringify({ symlink: readlinkSync(projectFile), content: (() => { try { return readFileSync(projectFile, 'utf8') } catch { return null } })() })
      : readFileSync(projectFile, 'utf8')
    preserveRecovery(userData, projectUuid, 'detached-backup.txt', backup)
    // Explicit repair action; this is the only operation allowed to remove a detached .tickets.
    unlinkSync(projectFile)
  }
  createProjectLink(projectFile, canonical, row.link_type)
  updateSync(db, projectUuid, canonical, projectFile, row.link_type, sha256(row.document_json), 'linked')
  return getProjectLinkStatus(db, userData, projectUuid)
}
