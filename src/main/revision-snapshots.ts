import type { WorkspaceDatabase } from './database'
import type { RevisionReference, RevisionSnapshot } from '../shared/contracts'

// Read-only: a comparison never writes SQLite, AppData JSON, or project .tickets.
export function loadRevisionSnapshot(
  db: WorkspaceDatabase, projectUuid: string, reference: RevisionReference
): RevisionSnapshot {
  if (typeof projectUuid !== 'string' || !/^[0-9a-f-]{36}$/iu.test(projectUuid)) {
    throw new Error('Invalid project UUID')
  }
  const current = db.prepare('SELECT document_json FROM documents WHERE project_uuid = ?')
    .get(projectUuid) as { document_json: string } | undefined
  if (!current) throw new Error('Project not found')

  if (reference === 'current') {
    return { reference, json: current.document_json }
  }
  if (!Number.isSafeInteger(reference) || reference < 1) throw new Error('Invalid revision ID')
  const row = db.prepare('SELECT snapshot_json FROM revisions WHERE project_uuid = ? AND revision_id = ?')
    .get(projectUuid, reference) as { snapshot_json: string } | undefined
  if (!row) throw new Error('Revision not found in this project')
  return { reference, json: row.snapshot_json }
}
