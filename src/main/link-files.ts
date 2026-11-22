import { createHash } from 'node:crypto'
import {
  closeSync, existsSync, fstatSync, fsyncSync, ftruncateSync, linkSync, lstatSync,
  mkdirSync, openSync, readFileSync, realpathSync, statSync, symlinkSync, writeFileSync, writeSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { LinkMode } from '../shared/contracts'

export function canonicalTicketsPath(userData: string, projectUuid: string): string {
  if (!/^[a-f0-9-]{36}$/iu.test(projectUuid)) throw new Error('Invalid project UUID')
  return join(userData, 'projects', projectUuid, 'tickets.json')
}

export function projectTicketsPath(projectRoot: string): string {
  return join(projectRoot, '.tickets')
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function fileExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export function ensureCanonical(path: string, documentJson: string): void {
  JSON.parse(documentJson)
  mkdirSync(dirname(path), { recursive: true })
  if (!fileExists(path)) {
    writeFileSync(path, documentJson, { encoding: 'utf8', flag: 'wx' })
    return
  }
  const text = readFileSync(path, 'utf8')
  JSON.parse(text)
  if (text !== documentJson) throw new Error('AppData tickets.json differs from SQLite. Reconcile before linking.')
}

// Hardlinks use file identity; symlinks must resolve to the canonical target.
export function verifyFileLink(target: string, canonical: string, mode: LinkMode): boolean {
  try {
    if (mode === 'symlink') {
      if (!lstatSync(target).isSymbolicLink()) return false
      return realpathSync.native(target) === realpathSync.native(canonical)
    }
    if (lstatSync(target).isSymbolicLink()) return false
    const a = statSync(target)
    const b = statSync(canonical)
    return a.dev === b.dev && a.ino === b.ino
  } catch {
    return false
  }
}

export function createProjectLink(
  target: string,
  canonical: string,
  mode: LinkMode
): void {
  if (mode !== 'hardlink' && mode !== 'symlink') throw new Error('Unknown link type')
  if (fileExists(target)) {
    if (verifyFileLink(target, canonical, mode)) return
    throw new Error('Existing .tickets file is not the configured link. Import or reconcile it before proceeding.')
  }
  try {
    if (mode === 'hardlink') linkSync(canonical, target)
    else symlinkSync(resolve(canonical), target, 'file')
  } catch (error) {
    if (mode === 'hardlink' && (error as NodeJS.ErrnoException).code === 'EXDEV') {
      throw new Error('Hardlinks require AppData and the project directory to be on the same volume. Choose a symbolic link.')
    }
    if (mode === 'symlink' && (error as NodeJS.ErrnoException).code === 'EPERM') {
      throw new Error('Windows denied symbolic link creation. Enable Developer Mode or run with the required privileges.')
    }
    throw error
  }
  if (!verifyFileLink(target, canonical, mode)) {
    throw new Error('The .tickets link was created but could not be verified.')
  }
}

// In-place writing preserves an existing hardlink's file identity.
export function writeCanonicalInPlace(path: string, value: string): void {
  JSON.parse(value)
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, value, { encoding: 'utf8', flag: 'wx' })
    return
  }
  const bytes = Buffer.from(value, 'utf8')
  const fd = openSync(path, 'r+')
  try {
    let offset = 0
    while (offset < bytes.length) {
      offset += writeSync(fd, bytes, offset, bytes.length - offset, offset)
    }
    ftruncateSync(fd, bytes.length)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function fileIdentity(path: string): string {
  const fd = openSync(path, 'r')
  try {
    const stat = fstatSync(fd)
    return String(stat.dev) + ':' + String(stat.ino)
  } finally {
    closeSync(fd)
  }
}
