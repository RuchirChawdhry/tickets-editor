import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface LockedPackage { version: string }
const lockfile = JSON.parse(
  readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8')
) as { packages: Record<string, LockedPackage> }

describe('locked minimatch security baseline', () => {
  it('uses patched minimatch 11.0.9 or later for all modern dependency branches', () => {
    const copies = Object.entries(lockfile.packages)
      .filter(([name]) => name.endsWith('/minimatch'))
    expect(copies.length).toBeGreaterThan(0)

    const modern = copies.filter(([, pkg]) => Number(pkg.version.split('.')[0]) >= 7)
    expect(modern.length).toBeGreaterThan(0)
    for (const [name, pkg] of modern) {
      const [major, minor, patch] = pkg.version.split('.').map(Number)
      expect(
        major > 11 || (major === 11 && (minor > 0 || patch >= 9)),
        name + ' resolves an unpatched minimatch ' + pkg.version
      ).toBe(true)
    }
  })

  it('keeps legacy dependencies on their compatible patched major versions', () => {
    const copies = Object.entries(lockfile.packages)
      .filter(([name]) => name.endsWith('/minimatch'))
    for (const [name, pkg] of copies) {
      const [major, minor, patch] = pkg.version.split('.').map(Number)
      if (major === 3) {
        expect(patch, name + ' must use patched minimatch 3.1.3+').toBeGreaterThanOrEqual(3)
        expect(minor).toBe(1)
      }
      if (major === 5) {
        expect(minor).toBe(1)
        expect(patch, name + ' must use patched minimatch 5.1.8+').toBeGreaterThanOrEqual(8)
      }
    }
  })
})
