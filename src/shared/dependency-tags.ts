/**
 * Parse a tag-entry input. Whitespace and commas finish an ID. The last
 * unfinished fragment stays in the input until a separator, Enter or blur.
 */
export function tokenizeDependencies(
  input: string, flush = false
): { tokens: string[]; pending: string } {
  const parts = input.split(/[\s,]+/u)
  const complete = flush || /[\s,]$/u.test(input)
  return {
    tokens: (complete ? parts : parts.slice(0, -1)).filter(Boolean),
    pending: complete ? '' : (parts.at(-1) ?? '')
  }
}

/** Keep existing IDs intact, including any duplicates imported from JSON. */
export function mergeDependencyTags(
  current: readonly string[], incoming: readonly string[]
): string[] {
  const result = [...current]
  const seen = new Set(current)
  for (const candidate of incoming) {
    const id = candidate.trim()
    if (!id || seen.has(id)) continue
    if (/[\s,]/u.test(id)) throw new TypeError('Dependency IDs cannot contain spaces or commas')
    result.push(id)
    seen.add(id)
  }
  return result
}

export function removeDependencyTag(current: readonly string[], index: number): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= current.length) {
    throw new RangeError('Invalid dependency index')
  }
  return current.filter((_, i) => i !== index)
}
