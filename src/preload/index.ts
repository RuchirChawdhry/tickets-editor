import { contextBridge, ipcRenderer } from 'electron'
import type { BatchOperation } from '../shared/batch-operations'
import type {
  ImportResult, LinkMode, ProjectDocument, ProjectInput, ProjectLinkStatus, RevisionRecord, TicketExportFormat,
  ProjectRecord, TicketObject, TicketRecord, TicketsEditorBridge, WorkspaceSummary,
  RevisionReference, RevisionSnapshot
} from '../shared/contracts'

const bridge: TicketsEditorBridge = {
  getVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
  getSummary: () => ipcRenderer.invoke('workspace:summary') as Promise<WorkspaceSummary>,
  listProjects: () => ipcRenderer.invoke('projects:list') as Promise<ProjectRecord[]>,
  chooseProjectDirectory: () => ipcRenderer.invoke('projects:choose-directory') as Promise<string | null>,
  registerProject: (input: ProjectInput) =>
    ipcRenderer.invoke('projects:register', input) as Promise<ProjectRecord>,
  updateProject: (id: string, input: ProjectInput) =>
    ipcRenderer.invoke('projects:update', id, input) as Promise<ProjectRecord>,
  removeProject: (id: string) => ipcRenderer.invoke('projects:remove', id) as Promise<void>,
  listTickets: (id: string) => ipcRenderer.invoke('tickets:list', id) as Promise<TicketRecord[]>,
  getProjectDocument: (id: string) =>
    ipcRenderer.invoke('projects:document', id) as Promise<ProjectDocument>,
  createTicket: (id: string) => ipcRenderer.invoke('tickets:create', id) as Promise<TicketRecord>,
  updateTicket: (id: string, ticketId: string, payload: TicketObject) =>
    ipcRenderer.invoke('tickets:update', id, ticketId, payload) as Promise<TicketRecord>,
  deleteTicket: (id: string, ticketId: string) =>
    ipcRenderer.invoke('tickets:delete', id, ticketId) as Promise<void>,
  importProjectDocument: (id: string) =>
    ipcRenderer.invoke('projects:import', id) as Promise<ImportResult | null>,
  batchEditTickets: (id: string, ids: string[], operation: BatchOperation) =>
    ipcRenderer.invoke('tickets:batch', id, ids, operation) as Promise<number>,
  duplicateTickets: (id: string, ids: string[]) =>
    ipcRenderer.invoke('tickets:duplicate-selected', id, ids) as Promise<number>,
  moveTickets: (id: string, ids: string[], direction: 'up' | 'down') =>
    ipcRenderer.invoke('tickets:move-selected', id, ids, direction) as Promise<number>,
  deleteSelectedTickets: (id: string, ids: string[]) =>
    ipcRenderer.invoke('tickets:delete-selected', id, ids) as Promise<number>,
  exportTickets: (id: string, scope: 'selection' | 'project', ids: string[], format: TicketExportFormat) =>
    ipcRenderer.invoke('tickets:export', id, scope, ids, format) as Promise<string | null>,
  getProjectLinkStatus: (id: string) =>
    ipcRenderer.invoke('projects:link-status', id) as Promise<ProjectLinkStatus>,
  setupProjectLink: (id: string, mode: LinkMode) =>
    ipcRenderer.invoke('projects:link-setup', id, mode) as Promise<ProjectLinkStatus>,
  importExternalChanges: (id: string, source: 'canonical' | 'detached' = 'canonical') =>
    ipcRenderer.invoke('projects:accept-external', id, source) as Promise<boolean>,
  recoverFromSqlite: (id: string) => ipcRenderer.invoke('projects:recover-from-sqlite', id) as Promise<boolean>,
  repairProjectLink: (id: string) => ipcRenderer.invoke('projects:repair-link', id) as Promise<ProjectLinkStatus | null>,
  getRevisionSnapshot: (id: string, reference: RevisionReference) =>
    ipcRenderer.invoke('projects:revision-snapshot', id, reference) as Promise<RevisionSnapshot>,
  listProjectRevisions: (id: string) => ipcRenderer.invoke('projects:revisions', id) as Promise<RevisionRecord[]>,
  restoreProjectRevision: (id: string, revisionId: number) =>
    ipcRenderer.invoke('projects:restore-revision', id, revisionId) as Promise<boolean>,
  onProjectLinkChanged: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('projects:link-changed', listener)
    return () => ipcRenderer.removeListener('projects:link-changed', listener)
  }
}
contextBridge.exposeInMainWorld('ticketsEditor', bridge)
