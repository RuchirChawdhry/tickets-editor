import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { readFileSync, writeFileSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getWorkspaceSummary, openWorkspaceDatabase } from './database'
import type { WorkspaceDatabase } from './database'
import {
  getProjectDocument, listProjects, listTickets, registerProject,
  removeProject, replaceProjectDocument, updateProject
} from './project-store'
import {
  assertProjectFileUnchanged, getProjectLinkStatus, initializeProjectFile,
  setupProjectLink, syncProjectFile, importExternalProjectFile, repairProjectLink,
  recoverCanonicalFromSqlite, listProjectRevisions, restoreProjectRevision
} from './project-links'
import type { LinkMode, ProjectInput, TicketObject, TicketExportFormat, RevisionReference } from '../shared/contracts'
import { loadRevisionSnapshot } from './revision-snapshots'
import type { BatchOperation } from '../shared/batch-operations'
import { TicketWorkspace } from './ticket-workspace'

let database: WorkspaceDatabase | undefined
let workspace: TicketWorkspace | undefined
const mcpMode = process.argv.includes('--mcp')
let mainWindow: BrowserWindow | undefined
const watchers = new Map<string, FSWatcher[]>()
let notifyHandle: ReturnType<typeof setTimeout> | undefined

function refreshLinkWatchers(): void {
  for (const handles of watchers.values()) for (const handle of handles) handle.close()
  watchers.clear()
  if (!database) return
  for (const project of listProjects(database)) {
    const handles: FSWatcher[] = []
    const paths = [project.rootPath, join(app.getPath('userData'), 'projects', project.projectUuid)]
    for (const path of paths) {
      try {
        handles.push(watch(path, () => {
          if (notifyHandle) clearTimeout(notifyHandle)
          notifyHandle = setTimeout(() => {
            const active = mainWindow
            if (active && !active.isDestroyed()) active.webContents.send('projects:link-changed')
          }, 300)
        }))
      } catch { /* unavailable directories are checked again on window focus */ }
    }
    watchers.set(project.projectUuid, handles)
  }
}


function authorized(event: Electron.IpcMainInvokeEvent): WorkspaceDatabase {
  if (!database || !mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error('Unauthorized workspace operation')
  }
  return database
}

function ticketService(): TicketWorkspace {
  if (!workspace) throw new Error('Ticket workspace is not available')
  return workspace
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
  mainWindow.on('focus', () => mainWindow?.webContents.send('projects:link-changed'))
  mainWindow.on('closed', () => { mainWindow = undefined })
}

function registerHandlers(): void {
  ipcMain.handle('app:version', event => { authorized(event); return app.getVersion() })
  ipcMain.handle('workspace:summary', event => getWorkspaceSummary(authorized(event)))
  ipcMain.handle('projects:list', event => { authorized(event); return ticketService().listProjects() })
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
    refreshLinkWatchers()
    return project
  })
  ipcMain.handle('projects:update', (event, id: string, input: ProjectInput) => {
    const db = authorized(event)
    assertProjectFileUnchanged(db, app.getPath('userData'), id)
    const changed = updateProject(db, id, input)
    syncProjectFile(db, app.getPath('userData'), id)
    refreshLinkWatchers()
    return changed
  })
  ipcMain.handle('projects:remove', (event, id: string) => {
    removeProject(authorized(event), id)
    refreshLinkWatchers()
  })
  ipcMain.handle('tickets:list', (event, id: string) => { authorized(event); return ticketService().listTickets(id) })
  ipcMain.handle('projects:document', (event, id: string) => { authorized(event); return ticketService().getDocument(id) })
  ipcMain.handle('tickets:create', (event, id: string) => {
    authorized(event)
    return ticketService().createTicket(id)
  })
  ipcMain.handle('tickets:update', (
    event, id: string, ticketId: string, payload: TicketObject, previousPayload?: TicketObject
  ) => {
    authorized(event)
    return ticketService().updateTicket(id, ticketId, payload, undefined, previousPayload)
  })
  ipcMain.handle('tickets:delete', (event, id: string, ticketId: string) => {
    authorized(event)
    return ticketService().deleteTicket(id, ticketId)
  })
  ipcMain.handle('tickets:batch', (event, id: string, ids: string[], operation: BatchOperation) => {
    authorized(event)
    return ticketService().batchEdit(id, ids, operation)
  })
  ipcMain.handle('tickets:duplicate-selected', (event, id: string, ids: string[]) => {
    authorized(event)
    return ticketService().duplicate(id, ids)
  })
  ipcMain.handle('tickets:move-selected', (
    event, id: string, ids: string[], direction: 'up' | 'down'
  ) => {
    authorized(event)
    return ticketService().move(id, ids, direction)
  })
  ipcMain.handle('tickets:delete-selected', (event, id: string, ids: string[]) => {
    authorized(event)
    return ticketService().deleteSelected(id, ids)
  })
  ipcMain.handle('tickets:export', async (event, id: string, scope: 'selection' | 'project',
    ids: string[], format: TicketExportFormat) => {
    const db = authorized(event)
    if (format !== 'compact' && format !== 'pretty' && format !== 'jsonl') throw new Error('Invalid export format')
    if (scope !== 'selection' && scope !== 'project') throw new Error('Invalid export scope')
    const project = listProjects(db).find(item => item.projectUuid === id)
    if (!project) throw new Error('Project not found')
    const records = listTickets(db, id)
    if (scope === 'selection' && (!ids.length || ids.some(uuid => !records.some(row => row.ticketUuid === uuid)))) {
      throw new Error('Select tickets in this project before exporting')
    }
    const data = scope === 'project'
      ? getProjectDocument(db, id).document
      : records.filter(row => ids.includes(row.ticketUuid)).map(row => row.payload)
    const output = format === 'jsonl'
      ? (Array.isArray(data) ? data : [data]).map(item => JSON.stringify(item)).join('\n')
      : JSON.stringify(data, null, format === 'pretty' ? 2 : undefined)
    const ext = format === 'jsonl' ? 'jsonl' : 'json'
    const dialogResult = await dialog.showSaveDialog(mainWindow!, {
      title: 'Export tickets',
      defaultPath: project.name.replace(/[^a-z0-9_-]/giu, '-') + '.tickets.' + ext,
      filters: [{ name: format === 'jsonl' ? 'JSON Lines' : 'JSON', extensions: [ext] }]
    })
    if (dialogResult.canceled || !dialogResult.filePath) return null
    writeFileSync(dialogResult.filePath, output, 'utf8')
    return dialogResult.filePath
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
    return db.transaction(() => {
      assertProjectFileUnchanged(db, app.getPath('userData'), id)
      const result = replaceProjectDocument(db, id, source, format)
      syncProjectFile(db, app.getPath('userData'), id)
      return result
    }).immediate()
  })
  ipcMain.handle('projects:revision-snapshot', (event, id: string, reference: RevisionReference) =>
    loadRevisionSnapshot(authorized(event), id, reference))
  ipcMain.handle('projects:revisions', (event, id: string) =>
    listProjectRevisions(authorized(event), id))
  ipcMain.handle('projects:restore-revision', async (event, id: string, revisionId: number) => {
    const db = authorized(event)
    const choice = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Restore revision'], defaultId: 0, cancelId: 0,
      message: 'Restore this project revision?',
      detail: 'The current SQLite document is preserved as a new revision before restoring.'
    })
    if (choice.response !== 1) return false
    restoreProjectRevision(db, app.getPath('userData'), id, revisionId)
    return true
  })
  ipcMain.handle('projects:accept-external', async (event, id: string, source: 'canonical' | 'detached' = 'canonical') => {
    const db = authorized(event)
    const status = getProjectLinkStatus(db, app.getPath('userData'), id)
    if (source === 'canonical' && !['changed', 'conflict'].includes(status.health)) {
      throw new Error('No external changes to import')
    }
    if (source === 'detached' && status.health !== 'broken') throw new Error('No detached .tickets file')
    const choice = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Import external JSON'], defaultId: 0, cancelId: 0,
      message: 'Replace the SQLite document with external tickets?',
      detail: 'Both versions will be saved to AppData recovery snapshots before import.'
    })
    if (choice.response !== 1) return false
    importExternalProjectFile(db, app.getPath('userData'), id, source)
    return true
  })
  ipcMain.handle('projects:recover-from-sqlite', async (event, id: string) => {
    const db = authorized(event)
    const choice = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Use SQLite version'], defaultId: 0, cancelId: 0,
      message: 'Restore AppData JSON from SQLite?',
      detail: 'Existing JSON and the SQLite state are backed up in AppData/recovery first.'
    })
    if (choice.response !== 1) return false
    recoverCanonicalFromSqlite(db, app.getPath('userData'), id)
    return true
  })
  ipcMain.handle('projects:repair-link', async (event, id: string) => {
    const db = authorized(event)
    const choice = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Cancel', 'Back up and repair'], defaultId: 0, cancelId: 0,
      message: 'Repair the project .tickets link?',
      detail: 'If .tickets has become a separate file, its contents will be backed up to AppData/recovery before replacing the path with a verified link.'
    })
    if (choice.response !== 1) return null
    return repairProjectLink(db, app.getPath('userData'), id)
  })

}

app.whenReady().then(() => {
  try {
    database = openWorkspaceDatabase(join(app.getPath('userData'), 'tickets-editor.sqlite'))
    workspace = new TicketWorkspace(database, app.getPath('userData'))
    if (mcpMode) {
      // The official SDK is ESM; load its bundled entry only when an MCP host
      // launches the Electron executable with --mcp. Do not open a GUI.
      const moduleUrl = pathToFileURL(join(__dirname, '../mcp/server.mjs')).href
      void import(moduleUrl).then(async module => {
        const start = module.startTicketMcpServer as (service: TicketWorkspace) => Promise<void>
        await start(ticketService())
      }).catch(error => {
        console.error('TicketsEditor MCP startup failed:', error)
        app.exit(1)
      })
      process.stdin.on('end', () => app.quit())
    } else {
      registerHandlers()
      createWindow()
      refreshLinkWatchers()
    }
  } catch (error) {
    if (mcpMode) console.error('TicketsEditor MCP failed:', error)
    else dialog.showErrorBox('TicketsEditor failed to start', String(error))
    app.quit()
  }
}).catch(error => {
  if (mcpMode) console.error('TicketsEditor MCP failed:', error)
  else dialog.showErrorBox('TicketsEditor failed to start', String(error))
  app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && database) createWindow()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('before-quit', () => {
  if (notifyHandle) clearTimeout(notifyHandle)
  for (const handles of watchers.values()) for (const handle of handles) handle.close()
  watchers.clear()
  database?.close()
  database = undefined
  workspace = undefined
})
