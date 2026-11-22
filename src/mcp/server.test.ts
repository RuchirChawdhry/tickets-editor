import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import type { TicketWorkspace } from '../main/ticket-workspace'
import { createTicketMcpServer } from './server'

const projectUuid = '00000000-0000-4000-8000-000000000011'
const ticketUuid = '00000000-0000-4000-8000-000000000012'
const payload = {
  id: 'dll-004',
  task: 'Index exports',
  deps: [],
  work: ['Enumerate exports'],
  tests: ['Verify exports'],
  success_criteria: ['All exports indexed']
}
const version = 'f'.repeat(64)

const closed: Array<() => Promise<void>> = []

async function connect() {
  const workspace = {
    listProjects: vi.fn(() => [{ projectUuid, name: 'DLL Viewer', rootPath: '/code/dll-viewer', ticketCount: 1 }]),
    getDocument: vi.fn(() => ({ projectUuid, sourceFormat: 'json', document: [payload] })),
    listTickets: vi.fn(() => [{
      ticketUuid, projectUuid, ticketId: payload.id, number: 1, pointer: '/0',
      payload, validation: { valid: true, errors: [] }
    }]),
    getTicket: vi.fn(() => ({
      ticketUuid, projectUuid, ticketId: payload.id, number: 1, pointer: '/0',
      payload, validation: { valid: true, errors: [] }
    })),
    getTicketHash: vi.fn(() => version),
    createTicket: vi.fn(() => ({ ticketUuid, payload })),
    updateTicket: vi.fn(() => ({ ticketUuid, payload: { ...payload, task: 'Updated' } })),
    deleteTicket: vi.fn(),
    batchEdit: vi.fn(() => 1),
    duplicate: vi.fn(() => 1),
    move: vi.fn(() => 1),
    getLinkStatus: vi.fn(() => ({ projectUuid, health: 'linked' }))
  } as unknown as TicketWorkspace
  const server = createTicketMcpServer(workspace)
  const client = new Client({ name: 'tickets-editor-test', version: '1.0.0' })
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  await client.connect(clientSide)
  closed.push(() => client.close(), () => server.close())
  return { client, workspace }
}

function firstText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const block = result.content?.find(part => part.type === 'text')
  return block?.text ?? ''
}

afterEach(async () => {
  for (const close of closed.splice(0).reverse()) await close()
})

describe('TicketsEditor MCP protocol', () => {
  it('advertises ticket CRUD and project discovery tools', async () => {
    const { client } = await connect()
    const names = (await client.listTools()).tools.map(tool => tool.name)
    expect(names).toContain('list_projects')
    expect(names).toContain('get_ticket')
    expect(names).toContain('create_ticket')
    expect(names).toContain('update_ticket')
    expect(names).toContain('delete_ticket')
    expect(names).toContain('batch_edit_tickets')
  })

  it('lists registered projects over MCP and does not touch the filesystem directly', async () => {
    const { client, workspace } = await connect()
    const reply = await client.callTool({ name: 'list_projects', arguments: {} })
    expect(JSON.parse(firstText(reply) as string)[0].projectUuid).toBe(projectUuid)
    expect(workspace.listProjects).toHaveBeenCalledOnce()
  })

  it('requires a version hash for agent ticket writes', async () => {
    const { client, workspace } = await connect()
    const invalid = await client.callTool({
      name: 'update_ticket',
      arguments: { project_uuid: projectUuid, ticket_uuid: ticketUuid, payload }
    })
    expect(invalid.isError).toBe(true)
    expect(workspace.updateTicket).not.toHaveBeenCalled()
    const valid = await client.callTool({
      name: 'update_ticket',
      arguments: { project_uuid: projectUuid, ticket_uuid: ticketUuid, expected_sha256: version, payload }
    })
    expect(valid.isError).not.toBe(true)
    expect(workspace.updateTicket).toHaveBeenCalledWith(projectUuid, ticketUuid, payload, version)
  })

  it('routes batch editing through the shared ticket service', async () => {
    const { client, workspace } = await connect()
    const operation = { kind: 'append', field: 'tests', value: 'Check forwarded exports' }
    const result = await client.callTool({
      name: 'batch_edit_tickets',
      arguments: { project_uuid: projectUuid, ticket_uuids: [ticketUuid], operation }
    })
    expect(JSON.parse(firstText(result) as string).changed).toBe(1)
    expect(workspace.batchEdit).toHaveBeenCalledWith(projectUuid, [ticketUuid], operation)
  })

  it('rejects an invalid project UUID before invoking application code', async () => {
    const { client, workspace } = await connect()
    const result = await client.callTool({ name: 'list_tickets', arguments: { project_uuid: '../outside' } })
    expect(result.isError).toBe(true)
    expect(workspace.listTickets).not.toHaveBeenCalled()
  })
})
