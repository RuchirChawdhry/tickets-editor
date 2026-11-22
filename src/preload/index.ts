import { contextBridge, ipcRenderer } from 'electron'
import type { TicketsEditorBridge, WorkspaceSummary } from '../shared/contracts'

const api: TicketsEditorBridge = {
  getVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
  getSummary: () => ipcRenderer.invoke('workspace:summary') as Promise<WorkspaceSummary>
}

contextBridge.exposeInMainWorld('ticketsEditor', api)
