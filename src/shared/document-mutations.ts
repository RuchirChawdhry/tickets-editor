import type { JsonPath, TicketObject } from './contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function locateNode(root: unknown, path: JsonPath): unknown {
  let current: unknown = root
  for (const key of path) {
    if (Array.isArray(current) && typeof key === 'number') current = current[key]
    else if (isRecord(current) && typeof key === 'string') current = current[key]
    else throw new Error('Ticket location no longer exists')
  }
  if (current === undefined) throw new Error('Ticket location no longer exists')
  return current
}

function parentOf(root: unknown, path: JsonPath): { parent: unknown; key: string | number } {
  if (path.length === 0) throw new Error('Cannot edit a root ticket without a container')
  return { parent: locateNode(root, path.slice(0, -1)), key: path[path.length - 1] }
}

export function replaceNode(root: unknown, path: JsonPath, value: TicketObject): unknown {
  if (path.length === 0) return value
  const { parent, key } = parentOf(root, path)
  if (Array.isArray(parent) && typeof key === 'number') parent[key] = value
  else if (isRecord(parent) && typeof key === 'string') parent[key] = value
  else throw new Error('Ticket parent is not editable')
  return root
}

export function removeNode(root: unknown, path: JsonPath): unknown {
  if (path.length === 0) return []
  const { parent, key } = parentOf(root, path)
  if (Array.isArray(parent) && typeof key === 'number') parent.splice(key, 1)
  else if (isRecord(parent) && typeof key === 'string') delete parent[key]
  else throw new Error('Ticket parent is not editable')
  return root
}

export function appendTicket(root: unknown, existingTicketPath: JsonPath | null): unknown {
  if (Array.isArray(root)) {
    root.push(emptyTicket())
    return root
  }
  if (!isRecord(root)) throw new Error('Document root must be a JSON array or object')
  if (Array.isArray(root.tickets)) {
    root.tickets.push(emptyTicket())
    return root
  }
  if (existingTicketPath && existingTicketPath.length > 0) {
    const collection = locateNode(root, existingTicketPath.slice(0, -1))
    if (Array.isArray(collection)) {
      collection.push(emptyTicket())
      return root
    }
  }
  root.tickets = [emptyTicket()]
  return root
}

export function emptyTicket(): TicketObject {
  return {
    id: 'ticket-' + globalThis.crypto.randomUUID().slice(0, 8),
    task: 'New ticket',
    deps: [],
    work: [],
    tests: []
  }
}
