import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkspaceDatabase } from './database'
import { canonicalTicketsPath, createProjectLink, fileExists, projectTicketsPath, sha256, verifyFileLink } from './link-files'
import { getProjectLinkStatus, recoverCanonicalFromSqlite, repairProjectLink } from './project-links'

const id = '00000000-0000-4000-8000-000000000011'
const dirs: string[] = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'tickets-sync-'))
  dirs.push(root)
  const appData = join(root, 'appdata')
  const project = join(root, 'project')
  mkdirSync(appData, { recursive: true })
  mkdirSync(project, { recursive: true })
  const canonical = canonicalTicketsPath(appData, id)
  mkdirSync(join(appData, 'projects', id), { recursive: true })
  const json = JSON.stringify([{ id: 'a', task: 'First', success_criteria: ['Pass'] }])
  writeFileSync(canonical, json)
  let committed = json
  let synced = sha256(json)
  let mode: 'hardlink' | 'symlink' | null = null
  const db = {
    prepare: (sql: string) => ({
      get: () => ({
        root_path: project, document_json: committed,
        backing_path: canonical, project_file_path: projectTicketsPath(project),
        link_type: mode, last_synced_sha256: synced, status: mode ? 'linked' : 'unconfigured'
      }),
      run: (...args: unknown[]) => {
        if (sql.startsWith('INSERT INTO sync_state')) {
          synced = args[4] as string
          mode = args[3] as 'hardlink' | 'symlink' | null
        }
      }
    })
  } as unknown as WorkspaceDatabase
  return {
    db, appData, project, canonical,
    link: () => {
      createProjectLink(projectTicketsPath(project), canonical, 'hardlink')
      mode = 'hardlink'
    },
    setSqlite: (text: string) => { committed = text },
    status: () => getProjectLinkStatus(db, appData, id)
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('project synchronization detection and recovery', () => {
  it('detects external edits without modifying SQLite', () => {
    const f = fixture()
    f.link()
    writeFileSync(projectTicketsPath(f.project), '[{"id":"external"}]')
    expect(f.status().health).toBe('changed')
  })

  it('flags simultaneous changes to DB and linked file as conflict', () => {
    const f = fixture()
    f.link()
    f.setSqlite('[{"id":"local"}]')
    writeFileSync(f.canonical, '[{"id":"external"}]')
    expect(f.status().health).toBe('conflict')
  })

  it('backs up a detached file before explicit hardlink repair', () => {
    const f = fixture()
    f.link()
    const target = projectTicketsPath(f.project)
    unlinkSync(target)
    writeFileSync(target, '[{"id":"detached","task":"External"}]')
    expect(f.status().health).toBe('broken')
    const repaired = repairProjectLink(f.db, f.appData, id)
    expect(repaired.health).toBe('linked')
    expect(verifyFileLink(target, f.canonical, 'hardlink')).toBe(true)
    const backups = join(f.appData, 'recovery', id)
    const names = readdirSync(backups)
    expect(names.length).toBe(1)
    expect(readFileSync(join(backups, names[0]), 'utf8')).toContain('"detached"')
  })

  it('restores a missing canonical file from SQLite', () => {
    const f = fixture()
    unlinkSync(f.canonical)
    expect(f.status().health).toBe('broken')
    recoverCanonicalFromSqlite(f.db, f.appData, id)
    expect(fileExists(f.canonical)).toBe(true)
    expect(f.status().health).toBe('unconfigured')
  })
})
