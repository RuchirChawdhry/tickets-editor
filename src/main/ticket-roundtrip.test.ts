import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openWorkspaceDatabase } from './database'
import type { WorkspaceDatabase } from './database'
import { getProjectDocument, listTickets, registerProject, replaceProjectDocument, updateTicket } from './project-store'
import { editTicketListItem, editTicketScalar, readTicketField } from '../shared/ticket-fields'
import { mergeDependencyTags, removeDependencyTag, tokenizeDependencies } from '../shared/dependency-tags'
import { collectTicketLocations } from '../shared/ticket-source'
import { locateNode, replaceNode } from '../shared/document-mutations'
import type { TicketObject } from '../shared/contracts'

const dirs: string[] = []
const handles: WorkspaceDatabase[] = []

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'tickets-roundtrip-'))
  dirs.push(root)
  const projectDirectory = join(root, 'project')
  mkdirSync(projectDirectory)
  const databasePath = join(root, 'workspace.sqlite')
  const db = openWorkspaceDatabase(databasePath)
  handles.push(db)
  const project = registerProject(db, { name: 'Agentic VM regression', rootPath: projectDirectory })
  return { db, databasePath, projectUuid: project.projectUuid }
}

function readFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL('../../tests/fixtures/' + name, import.meta.url)), 'utf8')
}

afterEach(() => {
  for (const db of handles.splice(0)) {
    if (db.open) db.close()
  }
  for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('real SQLite import/edit/save/reopen regression', () => {
  for (const fixture of [
    { name: 'mixed-shape-tickets.jsonl', format: 'jsonl' as const },
    { name: 'mixed-shape-nested.json', format: 'json' as const }
  ]) {
    it('round-trips ' + fixture.name + ' without changing unrelated JSON or field types', () => {
      const { db, databasePath, projectUuid } = workspace()
      const imported = replaceProjectDocument(db, projectUuid, readFixture(fixture.name), fixture.format)
      expect(imported).toEqual({ ticketCount: 3, sourceFormat: fixture.format })

      const before = getProjectDocument(db, projectUuid)
      const records = listTickets(db, projectUuid)
      expect(records).toHaveLength(3)
      expect(records.every(row => row.validation.valid)).toBe(true)
      const selected = records.find(row => row.ticketId === 'avm-089')!
      expect(readTicketField(selected.payload, 'work').kind).toBe('scalar')
      expect(readTicketField(selected.payload, 'tests').kind).toBe('scalar')
      expect(readTicketField(selected.payload, 'success_criteria').kind).toBe('missing')
      const edited = editTicketScalar(selected.payload, 'work', 'Publish wheel and installer')
      const saved = updateTicket(db, projectUuid, selected.ticketUuid, edited)
      expect(saved.ticketUuid).toBe(selected.ticketUuid)
      expect(saved.payload.work).toBe('Publish wheel and installer')
      expect(typeof saved.payload.tests).toBe('string')
      expect(saved.payload).not.toHaveProperty('success_criteria')

      // Rebuild the expected original document without reordering or dropping metadata.
      const expectedRoot = structuredClone(before.document)
      const location = collectTicketLocations(expectedRoot).find(x => x.ticketId === 'avm-089')!
      replaceNode(expectedRoot, location.path, edited)

      db.close()
      const reopened = openWorkspaceDatabase(databasePath)
      handles.push(reopened)
      const after = getProjectDocument(reopened, projectUuid)
      expect(after.sourceFormat).toBe(fixture.format)
      expect(after.document).toEqual(expectedRoot)
      expect(locateNode(after.document, location.path)).toEqual(edited)
      expect(listTickets(reopened, projectUuid).find(x => x.ticketId === 'avm-089')?.payload).toEqual(edited)
      expect(listTickets(reopened, projectUuid).find(x => x.ticketId === 'avm-090')?.payload)
        .toEqual(records.find(x => x.ticketId === 'avm-090')?.payload)
    })
  }

  it('preserves array-shaped work/tests through the same SQLite round trip', () => {
    const { db, databasePath, projectUuid } = workspace()
    replaceProjectDocument(db, projectUuid, readFixture('mixed-shape-nested.json'), 'json')
    const original = getProjectDocument(db, projectUuid)
    const record = listTickets(db, projectUuid).find(x => x.ticketId === 'avm-091')!
    expect(readTicketField(record.payload, 'tests')).toEqual({ kind: 'list', values: ['Unit', 'Integration'] })
    const edited = editTicketListItem(record.payload, 'tests', 1, 'SQLite regression')
    updateTicket(db, projectUuid, record.ticketUuid, edited)

    const expected = structuredClone(original.document)
    const location = collectTicketLocations(expected).find(x => x.ticketId === 'avm-091')!
    replaceNode(expected, location.path, edited)
    db.close()
    const reopened = openWorkspaceDatabase(databasePath)
    handles.push(reopened)
    expect(getProjectDocument(reopened, projectUuid).document).toEqual(expected)
    expect(readTicketField(listTickets(reopened, projectUuid).find(x => x.ticketId === 'avm-091')!.payload, 'tests'))
      .toEqual({ kind: 'list', values: ['Unit', 'SQLite regression'] })
  })

  it('retains all 91 compact ticket records when one is edited and persisted', () => {
    const { db, databasePath, projectUuid } = workspace()
    const payloads: TicketObject[] = Array.from({ length: 91 }, (_, index) => ({
      id: 'avm-' + String(index + 1).padStart(3, '0'),
      task: 'Task ' + (index + 1),
      deps: index ? ['avm-001'] : [],
      work: index % 2 === 0 ? 'Ship artifact ' + index : ['Build', 'Verify'],
      tests: index % 3 === 0 ? ['Smoke', 'Unit'] : 'Verify on a clean host',
      details: { parameters: [index, { keep: true }], flags: { untouched: true } }
    }))
    const source = payloads.map(value => JSON.stringify(value)).join('\n')
    expect(replaceProjectDocument(db, projectUuid, source, 'jsonl').ticketCount).toBe(91)
    const records = listTickets(db, projectUuid)
    expect(records).toHaveLength(91)
    expect(records.every(x => x.validation.valid)).toBe(true)

    const selected = records.find(x => x.ticketId === 'avm-089')!
    const edited = editTicketScalar(selected.payload, 'work', 'Ship signed installer')
    const parsed = tokenizeDependencies('avm-084,')
    const withDependency = { ...edited, deps: mergeDependencyTags(edited.deps as string[], parsed.tokens) }
    updateTicket(db, projectUuid, selected.ticketUuid, withDependency)
    const expected = structuredClone(payloads)
    expected[88] = withDependency

    db.close()
    const reopened = openWorkspaceDatabase(databasePath)
    handles.push(reopened)
    expect(getProjectDocument(reopened, projectUuid)).toEqual({
      projectUuid, sourceFormat: 'jsonl', document: expected
    })
    expect(listTickets(reopened, projectUuid).map(x => x.payload)).toEqual(expected)
    const persisted = listTickets(reopened, projectUuid)[88].payload
    expect(persisted.deps).toEqual(['avm-001', 'avm-084'])
    expect({ ...persisted, deps: removeDependencyTag(persisted.deps as string[], 1) })
      .toEqual(edited)
  })
})
