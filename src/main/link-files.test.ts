import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  canonicalTicketsPath, createProjectLink, ensureCanonical,
  verifyFileLink, writeCanonicalInPlace
} from './link-files'

const dirs: string[] = []
function temp(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tickets-editor-'))
  dirs.push(directory)
  return directory
}
afterEach(() => { for (const directory of dirs.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('AppData ticket link files', () => {
  it('places canonical tickets under userData/projects/<uuid>/tickets.json', () => {
    const root = temp()
    expect(canonicalTicketsPath(root, '00000000-0000-4000-8000-000000000001'))
      .toBe(join(root, 'projects', '00000000-0000-4000-8000-000000000001', 'tickets.json'))
  })

  it('links .tickets to canonical JSON and preserves link after writes', () => {
    const root = temp()
    const canonical = join(root, 'tickets.json')
    const projectFile = join(root, '.tickets')
    ensureCanonical(canonical, '[{"id":"a"}]')
    createProjectLink(projectFile, canonical, 'hardlink')
    expect(verifyFileLink(projectFile, canonical, 'hardlink')).toBe(true)
    writeCanonicalInPlace(canonical, '[]')
    expect(readFileSync(projectFile, 'utf8')).toBe('[]')
    expect(verifyFileLink(projectFile, canonical, 'hardlink')).toBe(true)
  })

  it('does not overwrite a pre-existing unrelated .tickets file', () => {
    const root = temp()
    const canonical = join(root, 'tickets.json')
    const target = join(root, '.tickets')
    ensureCanonical(canonical, '[]')
    writeFileSync(target, '{"original":true}')
    expect(() => createProjectLink(target, canonical, 'hardlink')).toThrow('Existing .tickets file')
    expect(readFileSync(target, 'utf8')).toBe('{"original":true}')
  })

  it('does not replace externally modified AppData JSON', () => {
    const root = temp()
    const canonical = join(root, 'tickets.json')
    ensureCanonical(canonical, '[]')
    writeFileSync(canonical, '[{"id":"modified"}]')
    expect(() => ensureCanonical(canonical, '[]')).toThrow('differs from SQLite')
  })

  it('can create an absolute file symbolic link where permitted', () => {
    const root = temp()
    const canonical = join(root, 'tickets.json')
    const target = join(root, '.tickets')
    ensureCanonical(canonical, '[]')
    try {
      createProjectLink(target, canonical, 'symlink')
      expect(verifyFileLink(target, canonical, 'symlink')).toBe(true)
      expect(readFileSync(target, 'utf8')).toBe('[]')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (process.platform !== 'win32' || code !== 'EPERM') throw error
      // Non-elevated Windows CI may not allow creating symlinks.
    }
  })
})
