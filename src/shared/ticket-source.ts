import type { JsonPath, SourceFormat, TicketLocation } from './contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseTicketSource(source: string, format: SourceFormat): unknown {
  // Some Windows text editors write a UTF-8 BOM. Accept it on every OS.
  const cleanSource = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (format === 'json') return JSON.parse(cleanSource) as unknown;

  const values: unknown[] = [];
  // Windows CRLF, Unix LF and legacy Mac CR separators are valid JSONL input.
  const lines = cleanSource.split(/\r\n|\n|\r/u);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue
    try {
      values.push(JSON.parse(line) as unknown)
    } catch {
      throw new SyntaxError('Invalid JSONL at line ' + (index + 1))
    }
  }
  return values
}

function jsonPointer(path: JsonPath): string {
  return path.map(segment => '/' + String(segment).replace(/~/gu, '~0').replace(/\//gu, '~1')).join('')
}

export function collectTicketLocations(root: unknown): TicketLocation[] {
  const result: TicketLocation[] = []
  function walk(node: unknown, path: JsonPath): void {
    if (Array.isArray(node)) {
      node.forEach((value, index) => walk(value, [...path, index]))
      return
    }
    if (!isRecord(node)) return
    // Candidate detection is intentionally permissive; validateTicket reports missing fields.
    if (typeof node.id === 'string' && ('task' in node || 'work' in node || 'success_criteria' in node)) {
      result.push({
        number: result.length + 1,
        ticketId: node.id,
        path,
        pointer: jsonPointer(path)
      })
      return
    }
    for (const [key, value] of Object.entries(node)) walk(value, [...path, key])
  }
  walk(root, [])
  return result
}
