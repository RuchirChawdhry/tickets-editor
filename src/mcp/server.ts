import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'
import type { TicketWorkspace } from '../main/ticket-workspace'
import type { TicketObject } from '../shared/contracts'
import type { BatchOperation } from '../shared/batch-operations'

const uuid = z.uuid()
const objectPayload = z.record(z.string(), z.unknown())
const selection = z.array(uuid).min(1).max(500)

const batchOperation = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('append'),
    field: z.enum(['deps', 'work', 'tests', 'success_criteria']),
    value: z.string().min(1)
  }),
  z.object({
    kind: z.literal('remove'),
    field: z.enum(['deps', 'work', 'tests', 'success_criteria']),
    value: z.string().min(1)
  }),
  z.object({
    kind: z.literal('replace'),
    field: z.enum(['task', 'work', 'tests', 'success_criteria', 'all']),
    find: z.string().min(1),
    replacement: z.string()
  })
])

type ToolValue = unknown

function response(value: ToolValue) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }]
  }
}

function invoke(action: () => ToolValue) {
  try {
    return response(action())
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
      isError: true
    }
  }
}

export function createTicketMcpServer(workspace: TicketWorkspace): McpServer {
  const server = new McpServer({ name: 'tickets-editor', version: '0.1.0' })

  server.registerTool('list_projects', {
    description: 'List registered TicketsEditor projects. Use project_uuid for other tools.',
    inputSchema: z.object({})
  }, async () => invoke(() => workspace.listProjects()))

  server.registerTool('get_project_document', {
    description: 'Read the full saved project ticket document from authoritative SQLite, preserving nesting.',
    inputSchema: z.object({ project_uuid: uuid })
  }, async ({ project_uuid }) => invoke(() => workspace.getDocument(project_uuid)))

  server.registerTool('list_tickets', {
    description: 'Search and paginate indexed tickets in a registered project. Returns ticket UUIDs and version hashes.',
    inputSchema: z.object({
      project_uuid: uuid,
      query: z.string().optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(50)
    })
  }, async ({ project_uuid, query, offset, limit }) => invoke(() => {
    const phrase = query?.trim().toLowerCase()
    const all = workspace.listTickets(project_uuid)
      .filter(ticket => !phrase || JSON.stringify(ticket.payload).toLowerCase().includes(phrase))
    return {
      total: all.length,
      offset,
      tickets: all.slice(offset, offset + limit).map(ticket => ({
        ticket_uuid: ticket.ticketUuid,
        ticket_id: ticket.ticketId,
        number: ticket.number,
        task: ticket.payload.task,
        valid: ticket.validation.valid,
        version_sha256: TicketWorkspaceHash(ticket.payload)
      }))
    }
  }))

  server.registerTool('get_ticket', {
    description: 'Read a complete ticket and its version_sha256 before changing or deleting it.',
    inputSchema: z.object({ project_uuid: uuid, ticket_uuid: uuid })
  }, async ({ project_uuid, ticket_uuid }) => invoke(() => ({
    ticket: workspace.getTicket(project_uuid, ticket_uuid),
    version_sha256: workspace.getTicketHash(project_uuid, ticket_uuid)
  })))

  server.registerTool('create_ticket', {
    description: 'Create a ticket in a registered project. Supply complete JSON payload or omit for an editable draft.',
    inputSchema: z.object({ project_uuid: uuid, payload: objectPayload.optional() })
  }, async ({ project_uuid, payload }) => invoke(() =>
    workspace.createTicket(project_uuid, payload as TicketObject | undefined)))

  server.registerTool('update_ticket', {
    description: 'Replace one ticket JSON payload. Requires version_sha256 from get_ticket to reject stale edits.',
    inputSchema: z.object({
      project_uuid: uuid,
      ticket_uuid: uuid,
      expected_sha256: z.string().regex(/^[0-9a-f]{64}$/u),
      payload: objectPayload
    })
  }, async ({ project_uuid, ticket_uuid, expected_sha256, payload }) => invoke(() =>
    workspace.updateTicket(project_uuid, ticket_uuid, payload, expected_sha256)))

  server.registerTool('delete_ticket', {
    description: 'Delete one ticket only if its current version still matches expected_sha256.',
    inputSchema: z.object({
      project_uuid: uuid,
      ticket_uuid: uuid,
      expected_sha256: z.string().regex(/^[0-9a-f]{64}$/u)
    })
  }, async ({ project_uuid, ticket_uuid, expected_sha256 }) => invoke(() => {
    workspace.deleteTicket(project_uuid, ticket_uuid, expected_sha256)
    return { deleted: true, ticket_uuid }
  }))

  server.registerTool('batch_edit_tickets', {
    description: 'Apply one append/remove/replace operation to multiple selected tickets in one SQLite transaction.',
    inputSchema: z.object({ project_uuid: uuid, ticket_uuids: selection, operation: batchOperation })
  }, async ({ project_uuid, ticket_uuids, operation }) => invoke(() => ({
    changed: workspace.batchEdit(project_uuid, ticket_uuids, operation as BatchOperation)
  })))

  server.registerTool('duplicate_tickets', {
    description: 'Duplicate selected tickets, generating new project-scoped ticket IDs.',
    inputSchema: z.object({ project_uuid: uuid, ticket_uuids: selection })
  }, async ({ project_uuid, ticket_uuids }) => invoke(() => ({
    duplicated: workspace.duplicate(project_uuid, ticket_uuids)
  })))

  server.registerTool('move_tickets', {
    description: 'Move selected tickets one position up or down within their existing JSON arrays.',
    inputSchema: z.object({
      project_uuid: uuid,
      ticket_uuids: selection,
      direction: z.enum(['up', 'down'])
    })
  }, async ({ project_uuid, ticket_uuids, direction }) => invoke(() => ({
    moved: workspace.move(project_uuid, ticket_uuids, direction)
  })))

  server.registerTool('get_link_status', {
    description: 'Inspect whether a project .tickets link still points to its canonical AppData JSON projection.',
    inputSchema: z.object({ project_uuid: uuid })
  }, async ({ project_uuid }) => invoke(() => workspace.getLinkStatus(project_uuid)))

  return server
}

// Avoid importing Node-only files from a renderer: this module is bundled into
// a separate ESM entrypoint and loaded only in Electron's headless --mcp mode.
function TicketWorkspaceHash(payload: TicketObject): string {
  // The version is derived from the exact payload serialized by SQLite.
  const text = JSON.stringify(payload)
  // This function is resolved through the Node crypto import below.
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

import { createHash } from 'node:crypto'

export async function startTicketMcpServer(workspace: TicketWorkspace): Promise<void> {
  await serveStdio(() => createTicketMcpServer(workspace))
}
