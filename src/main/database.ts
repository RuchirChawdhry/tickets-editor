import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import type { WorkspaceSummary } from '../shared/contracts'

export type WorkspaceDatabase = Database.Database

const SCHEMA_V1 = [
  'CREATE TABLE projects (project_uuid TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  "CREATE TABLE documents (project_uuid TEXT PRIMARY KEY REFERENCES projects(project_uuid) ON DELETE CASCADE, source_format TEXT NOT NULL CHECK(source_format IN ('json', 'jsonl')), document_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(document_json)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  'CREATE TABLE tickets (ticket_uuid TEXT PRIMARY KEY, project_uuid TEXT NOT NULL REFERENCES projects(project_uuid) ON DELETE CASCADE, ticket_id TEXT NOT NULL, sequence_index INTEGER NOT NULL, json_pointer TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(project_uuid, json_pointer))',
  'CREATE INDEX tickets_project_position ON tickets(project_uuid, sequence_index)',
  'CREATE INDEX tickets_project_id ON tickets(project_uuid, ticket_id)',
  'CREATE TABLE revisions (revision_id INTEGER PRIMARY KEY AUTOINCREMENT, project_uuid TEXT NOT NULL REFERENCES projects(project_uuid) ON DELETE CASCADE, ticket_uuid TEXT REFERENCES tickets(ticket_uuid) ON DELETE SET NULL, snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  "CREATE TABLE sync_state (project_uuid TEXT PRIMARY KEY REFERENCES projects(project_uuid) ON DELETE CASCADE, backing_path TEXT, project_file_path TEXT, last_synced_sha256 TEXT, last_known_file_id TEXT, status TEXT NOT NULL DEFAULT 'unconfigured' CHECK(status IN ('unconfigured', 'linked', 'changed', 'conflict', 'broken')), checked_at TEXT)"
].join(';\n') + ';'

export function migrateDatabase(db: WorkspaceDatabase): void {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version > 1) throw new Error('Unsupported SQLite schema version: ' + version)
  if (version === 1) return

  db.transaction(() => {
    db.exec(SCHEMA_V1)
    db.pragma('user_version = 1')
  })()
}

export function openWorkspaceDatabase(filePath: string): WorkspaceDatabase {
  mkdirSync(dirname(filePath), { recursive: true })
  const db = new Database(filePath)
  try {
    db.pragma('foreign_keys = ON')
    db.pragma('journal_mode = WAL')
    migrateDatabase(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function getWorkspaceSummary(db: WorkspaceDatabase): WorkspaceSummary {
  const projects = db.prepare('SELECT count(*) AS count FROM projects').get() as { count: number }
  const tickets = db.prepare('SELECT count(*) AS count FROM tickets').get() as { count: number }
  return { projectCount: projects.count, ticketCount: tickets.count }
}
