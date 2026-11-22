import { createHash } from 'node:crypto'
import type { WorkspaceDatabase } from './database'
import type { BatchOperation } from '../shared/batch-operations'
import type {
  ProjectDocument, ProjectLinkStatus, ProjectRecord, TicketObject, TicketRecord
} from '../shared/contracts'
import {
  applyBatchToTickets, createTicket, deleteSelectedTickets, deleteTicket,
  duplicateTickets, getProjectDocument, listProjects, listTickets, moveTickets, updateTicket
} from './project-store'
import {
  assertProjectFileUnchanged, getProjectLinkStatus, syncProjectFile
} from './project-links'

// One ticket service for Electron IPC and agent-facing MCP.
export class TicketWorkspace {
  constructor(
    private readonly db: WorkspaceDatabase,
    private readonly userData: string
  ) {}

  listProjects(): ProjectRecord[] {
    return listProjects(this.db)
  }

  getDocument(projectUuid: string): ProjectDocument {
    return getProjectDocument(this.db, projectUuid)
  }

  listTickets(projectUuid: string): TicketRecord[] {
    return listTickets(this.db, projectUuid)
  }

  getTicket(projectUuid: string, ticketUuid: string): TicketRecord {
    const ticket = this.listTickets(projectUuid).find(item => item.ticketUuid === ticketUuid)
    if (!ticket) throw new Error('Ticket not found in project')
    return ticket
  }

  getTicketHash(projectUuid: string, ticketUuid: string): string {
    return TicketWorkspace.payloadHash(this.getTicket(projectUuid, ticketUuid).payload)
  }

  static payloadHash(payload: TicketObject): string {
    return createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex')
  }

  getLinkStatus(projectUuid: string): ProjectLinkStatus {
    return getProjectLinkStatus(this.db, this.userData, projectUuid)
  }

  // Acquire SQLite's write lock *before* checking the file and ticket version.
  // Both IPC and MCP use this guard so competing processes cannot interleave
  // their SQLite updates and projection writes.
  private write<T>(projectUuid: string, callback: () => T): T {
    return this.db.transaction(() => {
      assertProjectFileUnchanged(this.db, this.userData, projectUuid)
      const result = callback()
      syncProjectFile(this.db, this.userData, projectUuid)
      return result
    }).immediate()
  }

  private assertExpected(
    projectUuid: string,
    ticketUuid: string,
    expectedSha256?: string,
    expectedPayload?: TicketObject
  ): void {
    if (!expectedSha256 && !expectedPayload) return
    const ticket = this.getTicket(projectUuid, ticketUuid)
    if (expectedSha256 && TicketWorkspace.payloadHash(ticket.payload) !== expectedSha256) {
      throw new Error('Ticket changed since it was read. Fetch the latest ticket before writing.')
    }
    if (expectedPayload && JSON.stringify(ticket.payload) !== JSON.stringify(expectedPayload)) {
      throw new Error('Ticket changed since the editor opened it. Reload before saving.')
    }
  }

  createTicket(projectUuid: string, payload?: TicketObject): TicketRecord {
    return this.write(projectUuid, () => {
      const created = createTicket(this.db, projectUuid)
      return payload ? updateTicket(this.db, projectUuid, created.ticketUuid, payload) : created
    })
  }

  updateTicket(
    projectUuid: string,
    ticketUuid: string,
    payload: TicketObject,
    expectedSha256?: string,
    expectedPayload?: TicketObject
  ): TicketRecord {
    return this.write(projectUuid, () => {
      this.assertExpected(projectUuid, ticketUuid, expectedSha256, expectedPayload)
      return updateTicket(this.db, projectUuid, ticketUuid, payload)
    })
  }

  deleteTicket(projectUuid: string, ticketUuid: string, expectedSha256?: string): void {
    this.write(projectUuid, () => {
      this.assertExpected(projectUuid, ticketUuid, expectedSha256)
      deleteTicket(this.db, projectUuid, ticketUuid)
    })
  }

  batchEdit(projectUuid: string, uuids: string[], operation: BatchOperation): number {
    return this.write(projectUuid, () => applyBatchToTickets(this.db, projectUuid, uuids, operation))
  }

  duplicate(projectUuid: string, uuids: string[]): number {
    return this.write(projectUuid, () => duplicateTickets(this.db, projectUuid, uuids))
  }

  move(projectUuid: string, uuids: string[], direction: 'up' | 'down'): number {
    return this.write(projectUuid, () => moveTickets(this.db, projectUuid, uuids, direction))
  }

  deleteSelected(projectUuid: string, uuids: string[]): number {
    return this.write(projectUuid, () => deleteSelectedTickets(this.db, projectUuid, uuids))
  }
}
