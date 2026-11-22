import { contextBridge, ipcRenderer } from 'electron'
import type {
  ImportResult, LinkMode, ProjectDocument, ProjectInput, ProjectLinkStatus, RevisionRecord,
  ProjectRecord, TicketObject, TicketRecord, TicketsEditorBridge, WorkspaceSummary
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
  getProjectLinkStatus: (id: string) =>
    ipcRenderer.invoke('projects:link-status', id) as Promise<ProjectLinkStatus>,
  setupProjectLink: (id: string, mode: LinkMode) =>
    ipcRenderer.invoke('projects:link-setup', id, mode) as Promise<ProjectLinkStatus>,
  importExternalChanges: (id: string, source: 'canonical' | 'detached' = 'canonical') =>
    ipcRenderer.invoke('projects:accept-external', id, source) as Promise<boolean>,
  recoverFromSqlite: (id: string) => ipcRenderer.invoke('projects:recover-from-sqlite', id) as Promise<boolean>,
  repairProjectLink: (id: string) => ipcRenderer.invoke('projects:repair-link', id) as Promise<ProjectLinkStatus | null>,
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
