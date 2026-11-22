import { describe, expect, it } from 'vitest'
import type { WorkspaceDatabase } from './database'
import { loadRevisionSnapshot } from './revision-snapshots'

const projectUuid = '00000000-0000-4000-8000-000000000011'

function dbFixture(): WorkspaceDatabase {
  return {
    prepare(sql: string) {
      return {
        get(...args: unknown[]) {
          if (args[0] !== projectUuid) return undefined
          if (sql.includes('FROM documents')) return { document_json: '{"value":"current"}' }
          if (sql.includes('FROM revisions') && args[1] === 3) {
            return { snapshot_json: '{"value":"previous"}' }
          }
          return undefined
        }
      }
    }
  } as unknown as WorkspaceDatabase
}

describe('revision snapshot access', () => {
  it('loads the current accepted SQLite document', () => {
    expect(loadRevisionSnapshot(dbFixture(), projectUuid, 'current')).toEqual({
      reference: 'current', json: '{"value":"current"}'
    })
  })
  it('loads only a revision belonging to the requested project', () => {
    expect(loadRevisionSnapshot(dbFixture(), projectUuid, 3)).toEqual({
      reference: 3, json: '{"value":"previous"}'
    })
    expect(() => loadRevisionSnapshot(dbFixture(), projectUuid, 4)).toThrow('Revision not found')
  })
  it('rejects invalid revision identifiers and missing projects', () => {
    expect(() => loadRevisionSnapshot(dbFixture(), projectUuid, -1)).toThrow('Invalid revision ID')
    expect(() => loadRevisionSnapshot(dbFixture(), projectUuid, 2.5)).toThrow('Invalid revision ID')
    expect(() => loadRevisionSnapshot(dbFixture(), '00000000-0000-4000-8000-000000000012', 3))
      .toThrow('Project not found')
  })
})
