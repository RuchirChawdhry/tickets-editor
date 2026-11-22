import { readFileSync } from 'node:fs'
import type { WorkspaceDatabase } from './database'
import type { LinkMode, ProjectLinkStatus } from '../shared/contracts'
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

export function getProjectLinkStatus(
  db: WorkspaceDatabase,
  userData: string,
  projectUuid: string
): ProjectLinkStatus {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  let health: ProjectLinkStatus['health'] = 'unconfigured'
  let details = 'No project link has been configured.'
  if (row.link_type) {
    if (!fileExists(canonical) || !verifyFileLink(projectFile, canonical, row.link_type)) {
      health = 'broken'
      details = 'The project .tickets link is missing or no longer references its AppData file.'
    } else {
      const hash = sha256(readFileSync(canonical, 'utf8'))
      if (row.last_synced_sha256 && hash !== row.last_synced_sha256) {
        health = 'changed'
        details = 'The linked file has external changes. Reconcile before editing.'
      } else {
        health = 'linked'
        details = 'The .tickets link is healthy.'
      }
    }
  } else if (fileExists(canonical) && row.last_synced_sha256) {
    const hash = sha256(readFileSync(canonical, 'utf8'))
    if (hash !== row.last_synced_sha256) {
      health = 'changed'
      details = 'The AppData JSON file has external changes.'
    }
  }
  return { projectUuid, mode: row.link_type, health, canonicalPath: canonical, projectFilePath: projectFile, details }
}

// Called immediately after project registration to create the canonical AppData file.
export function initializeProjectFile(db: WorkspaceDatabase, userData: string, projectUuid: string): void {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  ensureCanonical(canonical, row.document_json)
  updateSync(db, projectUuid, canonical, projectFile, null, sha256(row.document_json), 'unconfigured')
}

// Never overwrite an externally modified file or proceed with a broken link.
export function assertProjectFileUnchanged(db: WorkspaceDatabase, userData: string, projectUuid: string): void {
  const state = getProjectLinkStatus(db, userData, projectUuid)
  if (state.health === 'broken' || state.health === 'changed') {
    throw new Error(state.details)
  }
}

// Keep SQLite and the AppData JSON in sync after an accepted change.
export function syncProjectFile(db: WorkspaceDatabase, userData: string, projectUuid: string): void {
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  writeCanonicalInPlace(canonical, row.document_json)
  updateSync(db, projectUuid, canonical, projectFile, row.link_type, sha256(row.document_json), row.link_type ? 'linked' : 'unconfigured')
}

export function setupProjectLink(
  db: WorkspaceDatabase,
  userData: string,
  projectUuid: string,
  mode: LinkMode
): ProjectLinkStatus {
  if (mode !== 'hardlink' && mode !== 'symlink') throw new Error('Choose a valid link mode')
  const { row, canonical, projectFile } = paths(db, userData, projectUuid)
  if (row.link_type && row.link_type !== mode) {
    throw new Error('A link is already registered. Repair or explicitly remove it before changing link type.')
  }
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
