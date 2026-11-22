import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { getWorkspaceSummary, openWorkspaceDatabase } from './database'
import type { WorkspaceDatabase } from './database'
import {
  createTicket, deleteTicket, getProjectDocument, listProjects, listTickets,
  registerProject, removeProject, replaceProjectDocument, updateProject, updateTicket
} from './project-store'
import {
  assertProjectFileUnchanged, getProjectLinkStatus, initializeProjectFile,
  setupProjectLink, syncProjectFile
} from './project-links'
import type { LinkMode, ProjectInput, TicketObject } from '../shared/contracts'

let database: WorkspaceDatabase | undefined
let mainWindow: BrowserWindow | undefined

function authorized(event: Electron.IpcMainInvokeEvent): WorkspaceDatabase {
  if (!database || !mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Unauthorized workspace operation')
  }
  return database
}

function mutateProject<T>(db: WorkspaceDatabase, projectUuid: string, apply: () => T): T {
  assertProjectFileUnchanged(db, app.getPath('userData'), projectUuid)
  const result = apply()
  syncProjectFile(db, app.getPath('userData'), projectUuid)
  return result
}

function createWindow(): void {
  const onWindows = process.platform === 'win32'
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 900,
    minHeight: 570,
    backgroundColor: '#20242a',
    title: 'TicketsEditor',
    titleBarStyle: onWindows ? 'hidden' : 'default',
    titleBarOverlay: onWindows ? { color: '#20242a', symbolColor: '#f3f4f6', height: 42 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  Menu.setApplicationMenu(null)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = undefined })
}

function registerHandlers(): void {
  ipcMain.handle('app:version', event => { authorized(event); return app.getVersion() })
  ipcMain.handle('workspace:summary', event => getWorkspaceSummary(authorized(event)))
  ipcMain.handle('projects:list', event => listProjects(authorized(event)))
  ipcMain.handle('projects:choose-directory', async event => {
    authorized(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Choose project directory',
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  ipcMain.handle('projects:register', (event, input: ProjectInput) => {
    const db = authorized(event)
    const project = registerProject(db, input)
    try {
      initializeProjectFile(db, app.getPath('userData'), project.projectUuid)
    } catch (error) {
      removeProject(db, project.projectUuid)
      throw error
    }
    return project
  })
  ipcMain.handle('projects:update', (event, id: string, input: ProjectInput) => {
    const db = authorized(event)
    const changed = updateProject(db, id, input)
    syncProjectFile(db, app.getPath('userData'), id)
    return changed
  })
  ipcMain.handle('projects:remove', (event, id: string) => removeProject(authorized(event), id))
  ipcMain.handle('tickets:list', (event, id: string) => listTickets(authorized(event), id))
  ipcMain.handle('projects:document', (event, id: string) => getProjectDocument(authorized(event), id))
  ipcMain.handle('tickets:create', (event, id: string) => {
    const db = authorized(event)
    return mutateProject(db, id, () => createTicket(db, id))
  })
  ipcMain.handle('tickets:update', (event, id: string, ticketId: string, payload: TicketObject) => {
    const db = authorized(event)
    return mutateProject(db, id, () => updateTicket(db, id, ticketId, payload))
  })
  ipcMain.handle('tickets:delete', (event, id: string, ticketId: string) => {
    const db = authorized(event)
    return mutateProject(db, id, () => deleteTicket(db, id, ticketId))
  })
  ipcMain.handle('projects:link-status', (event, id: string) =>
    getProjectLinkStatus(authorized(event), app.getPath('userData'), id))
  ipcMain.handle('projects:link-setup', (event, id: string, mode: LinkMode) =>
    setupProjectLink(authorized(event), app.getPath('userData'), id, mode))
  ipcMain.handle('projects:import', async (event, id: string) => {
    const db = authorized(event)
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Import project tickets',
      properties: ['openFile'],
      filters: [
        { name: 'Tickets', extensions: ['json', 'jsonl', 'tickets'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    if (listTickets(db, id).length > 0) {
      const confirm = await dialog.showMessageBox(mainWindow!, {
        type: 'warning',
        buttons: ['Cancel', 'Replace document'],
        defaultId: 0,
        cancelId: 0,
        message: 'Replace the project ticket document?',
        detail: 'The prior document remains in SQLite revision history. Original files are not modified.'
      })
      if (confirm.response !== 1) return null
    }
    const filePath = result.filePaths[0]
    const format = extname(filePath).toLowerCase() === '.jsonl' ? 'jsonl' : 'json'
    const source = readFileSync(filePath, 'utf8')
    return mutateProject(db, id, () => replaceProjectDocument(db, id, source, format))
  })
  ipcMain.handle('projects:accept-external', async (event, id: string) => {
    const db = authorized(event)
    const status = getProjectLinkStatus(db, app.getPath('userData'), id)
    if (status.health !== 'changed') throw new Error('No pending external changes')
    const prompt = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Import external JSON'],
      defaultId: 0,
      cancelId: 0,
      message: 'Import externally changed tickets.json?',
      detail: 'This replaces the current SQLite project document. Your previous revision remains available for recovery.'
    })
    if (prompt.response !== 1) return null
    const source = readFileSync(status.canonicalPath, 'utf8')
    const result = replaceProjectDocument(db, id, source, 'json')
    syncProjectFile(db, app.getPath('userData'), id)
    return result
  })
}

app.whenReady().then(() => {
  try {
    database = openWorkspaceDatabase(join(app.getPath('userData'), 'tickets-editor.sqlite'))
    registerHandlers()
    createWindow()
  } catch (error) {
    dialog.showErrorBox('TicketsEditor failed to start', String(error))
    app.quit()
  }
}).catch(error => {
  dialog.showErrorBox('TicketsEditor failed to start', String(error))
  app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && database) createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => { database?.close(); database = undefined })
