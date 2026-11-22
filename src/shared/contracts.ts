export type SourceFormat = 'json' | 'jsonl'
export type LinkMode = 'hardlink' | 'symlink'
export type LinkHealth = 'unconfigured' | 'linked' | 'broken' | 'changed' | 'conflict'
export type JsonPath = Array<string | number>
export type TicketObject = Record<string, unknown>
export type TicketExportFormat = 'compact' | 'pretty' | 'jsonl'
import type { BatchOperation } from './batch-operations'

export interface TicketLocation {
  number: number
  ticketId: string
  path: JsonPath
  pointer: string
}

export interface TicketValidation {
  valid: boolean
  errors: string[]
}

export interface WorkspaceSummary {
  projectCount: number
  ticketCount: number
}

export interface ProjectRecord {
  projectUuid: string
  name: string
  rootPath: string
  ticketCount: number
}

export interface ProjectInput {
  name: string
  rootPath: string
}

export interface TicketRecord {
  ticketUuid: string
  projectUuid: string
  ticketId: string
  number: number
  pointer: string
  payload: TicketObject
  validation: TicketValidation
}

export interface ProjectDocument {
  projectUuid: string
  sourceFormat: SourceFormat
  document: unknown
}

export interface ImportResult {
  ticketCount: number
  sourceFormat: SourceFormat
}

export interface ProjectLinkStatus {
  projectUuid: string
  mode: LinkMode | null
  health: LinkHealth
  canonicalPath: string
  projectFilePath: string
  details: string
}

export type RevisionReference = number | 'current'

export interface RevisionSnapshot {
  reference: RevisionReference
  json: string
}

export interface RevisionRecord {
  revisionId: number
  createdAt: string
}

export interface TicketsEditorBridge {
  getVersion(): Promise<string>
  getSummary(): Promise<WorkspaceSummary>
  listProjects(): Promise<ProjectRecord[]>
  chooseProjectDirectory(): Promise<string | null>
  registerProject(input: ProjectInput): Promise<ProjectRecord>
  updateProject(projectUuid: string, input: ProjectInput): Promise<ProjectRecord>
  removeProject(projectUuid: string): Promise<void>
  listTickets(projectUuid: string): Promise<TicketRecord[]>
  getProjectDocument(projectUuid: string): Promise<ProjectDocument>
  createTicket(projectUuid: string): Promise<TicketRecord>
  updateTicket(projectUuid: string, ticketUuid: string, payload: TicketObject, previousPayload?: TicketObject): Promise<TicketRecord>
  deleteTicket(projectUuid: string, ticketUuid: string): Promise<void>
  importProjectDocument(projectUuid: string): Promise<ImportResult | null>
  batchEditTickets(projectUuid: string, ids: string[], operation: BatchOperation): Promise<number>
  duplicateTickets(projectUuid: string, ids: string[]): Promise<number>
  moveTickets(projectUuid: string, ids: string[], direction: 'up' | 'down'): Promise<number>
  deleteSelectedTickets(projectUuid: string, ids: string[]): Promise<number>
  exportTickets(projectUuid: string, scope: 'selection' | 'project', ids: string[], format: TicketExportFormat): Promise<string | null>
  getProjectLinkStatus(projectUuid: string): Promise<ProjectLinkStatus>
  setupProjectLink(projectUuid: string, mode: LinkMode): Promise<ProjectLinkStatus>
  importExternalChanges(projectUuid: string, source?: 'canonical' | 'detached'): Promise<boolean>
  recoverFromSqlite(projectUuid: string): Promise<boolean>
  repairProjectLink(projectUuid: string): Promise<ProjectLinkStatus | null>
  listProjectRevisions(projectUuid: string): Promise<RevisionRecord[]>
  getRevisionSnapshot(projectUuid: string, reference: RevisionReference): Promise<RevisionSnapshot>
  restoreProjectRevision(projectUuid: string, revisionId: number): Promise<boolean>
  onProjectLinkChanged(callback: () => void): () => void
}
