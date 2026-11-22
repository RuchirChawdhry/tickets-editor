export type DiffKind = 'equal' | 'added' | 'removed' | 'changed'

export interface DiffSide {
  number: number
  text: string
}

export interface DiffRow {
  kind: DiffKind
  before: DiffSide | null
  after: DiffSide | null
}

export interface RevisionDiff {
  rows: DiffRow[]
  hunks: number[]
  added: number
  removed: number
  changed: number
}

type Op = { kind: 'equal' | 'added' | 'removed'; text: string }
const MAX_MATRIX_CELLS = 1_000_000

function uniqueAnchors(before: string[], after: string[]): Array<[number, number]> {
  const positions = new Map<string, number>()
  const duplicate = new Set<string>()
  for (let i = 0; i < after.length; i++) {
    const line = after[i]
    if (positions.has(line)) duplicate.add(line)
    else positions.set(line, i)
  }
  const seen = new Set<string>()
  const candidates: Array<[number, number]> = []
  for (let i = 0; i < before.length; i++) {
    const line = before[i]
    if (seen.has(line)) {
      duplicate.add(line)
      continue
    }
    seen.add(line)
    const pos = positions.get(line)
    if (pos !== undefined) candidates.push([i, pos])
  }
  const anchors = candidates.filter(([i]) => !duplicate.has(before[i]))
  // Longest increasing subsequence of after-indices preserves both document orders.
  const tails: number[] = []
  const predecessors: number[] = []
  for (let i = 0; i < anchors.length; i++) {
    const position = anchors[i][1]
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (anchors[tails[middle]][1] < position) low = middle + 1
      else high = middle
    }
    predecessors[i] = low > 0 ? tails[low - 1] : -1
    tails[low] = i
  }
  const result: Array<[number, number]> = []
  let at = tails.length ? tails[tails.length - 1] : -1
  while (at >= 0) {
    result.push(anchors[at])
    at = predecessors[at]
  }
  return result.reverse()
}

function lineOps(before: string[], after: string[]): Op[] {
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const start = before.slice(0, prefix).map(text => ({ kind: 'equal' as const, text }))
  const finish = before.slice(before.length - suffix).map(text => ({ kind: 'equal' as const, text }))
  const old = before.slice(prefix, before.length - suffix)
  const next = after.slice(prefix, after.length - suffix)
  if (!old.length) return [...start, ...next.map(text => ({ kind: 'added' as const, text })), ...finish]
  if (!next.length) return [...start, ...old.map(text => ({ kind: 'removed' as const, text })), ...finish]

  if (old.length * next.length <= MAX_MATRIX_CELLS) {
    const dp: Uint32Array[] = Array.from(
      { length: old.length + 1 }, () => new Uint32Array(next.length + 1)
    )
    for (let i = old.length - 1; i >= 0; i--) {
      for (let j = next.length - 1; j >= 0; j--) {
        dp[i][j] = old[i] === next[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
    const result: Op[] = []
    let i = 0
    let j = 0
    while (i < old.length || j < next.length) {
      if (i < old.length && j < next.length && old[i] === next[j]) {
        result.push({ kind: 'equal', text: old[i++] })
        j++
      } else if (i < old.length && (j === next.length || dp[i + 1][j] >= dp[i][j + 1])) {
        result.push({ kind: 'removed', text: old[i++] })
      } else {
        result.push({ kind: 'added', text: next[j++] })
      }
    }
    return [...start, ...result, ...finish]
  }

  const anchors = uniqueAnchors(old, next)
  if (!anchors.length) {
    return [
      ...start,
      ...old.map(text => ({ kind: 'removed' as const, text })),
      ...next.map(text => ({ kind: 'added' as const, text })),
      ...finish
    ]
  }
  const result: Op[] = []
  let i = 0
  let j = 0
  for (const [oldIndex, newIndex] of anchors) {
    result.push(...lineOps(old.slice(i, oldIndex), next.slice(j, newIndex)))
    result.push({ kind: 'equal', text: old[oldIndex] })
    i = oldIndex + 1
    j = newIndex + 1
  }
  result.push(...lineOps(old.slice(i), next.slice(j)))
  return [...start, ...result, ...finish]
}

function prettyJson(source: string): string[] {
  const parsed: unknown = JSON.parse(source)
  return JSON.stringify(parsed, null, 2).split('\n')
}

export function buildRevisionDiff(beforeJson: string, afterJson: string): RevisionDiff {
  const ops = lineOps(prettyJson(beforeJson), prettyJson(afterJson))
  const rows: DiffRow[] = []
  let oldLine = 1
  let newLine = 1
  let added = 0
  let removed = 0
  let changed = 0

  for (let at = 0; at < ops.length;) {
    if (ops[at].kind === 'equal') {
      rows.push({
        kind: 'equal',
        before: { number: oldLine++, text: ops[at].text },
        after: { number: newLine++, text: ops[at].text }
      })
      at++
      continue
    }

    const deletions: string[] = []
    const insertions: string[] = []
    while (at < ops.length && ops[at].kind !== 'equal') {
      if (ops[at].kind === 'removed') deletions.push(ops[at].text)
      else insertions.push(ops[at].text)
      at++
    }
    for (let i = 0; i < Math.max(deletions.length, insertions.length); i++) {
      const before = i < deletions.length ? { number: oldLine++, text: deletions[i] } : null
      const after = i < insertions.length ? { number: newLine++, text: insertions[i] } : null
      const kind: DiffKind = before && after ? 'changed' : before ? 'removed' : 'added'
      if (kind === 'changed') changed++
      else if (kind === 'removed') removed++
      else added++
      rows.push({ kind, before, after })
    }
  }

  const hunks: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'equal' && (i === 0 || rows[i - 1].kind === 'equal')) hunks.push(i)
  }
  return { rows, hunks, added, removed, changed }
}

export type VisibleDiffRow =
  | { kind: 'row'; index: number; row: DiffRow }
  | { kind: 'gap'; index: number; count: number }

export function visibleDiffRows(diff: RevisionDiff, contextLines = 3): VisibleDiffRow[] {
  if (!diff.hunks.length) return []
  const show = new Set<number>()
  for (let i = 0; i < diff.rows.length; i++) {
    if (diff.rows[i].kind === 'equal') continue
    for (let j = Math.max(0, i - contextLines); j <= Math.min(diff.rows.length - 1, i + contextLines); j++) {
      show.add(j)
    }
  }
  const result: VisibleDiffRow[] = []
  for (let i = 0; i < diff.rows.length;) {
    if (show.has(i)) {
      result.push({ kind: 'row', index: i, row: diff.rows[i] })
      i++
    } else {
      const start = i
      while (i < diff.rows.length && !show.has(i)) i++
      result.push({ kind: 'gap', index: start, count: i - start })
    }
  }
  return result
}
