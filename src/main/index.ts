import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { join } from 'node:path'
import { getWorkspaceSummary, openWorkspaceDatabase } from './database'
import type { WorkspaceDatabase } from './database'

let database: WorkspaceDatabase | undefined
let mainWindow: BrowserWindow | undefined

function createWindow(): void {
  const windows = process.platform === 'win32'
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 800,
    minWidth: 860,
    minHeight: 550,
    backgroundColor: '#20242a',
    title: 'TicketsEditor',
    titleBarStyle: windows ? 'hidden' : 'default',
    titleBarOverlay: windows ? { color: '#20242a', symbolColor: '#f3f4f6', height: 42 } : undefined,
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

app.whenReady().then(() => {
  try {
    database = openWorkspaceDatabase(join(app.getPath('userData'), 'tickets-editor.sqlite'))
    ipcMain.handle('app:version', event => {
      if (event.sender !== mainWindow?.webContents) throw new Error('Unauthorized IPC sender')
      return app.getVersion()
    })
    ipcMain.handle('workspace:summary', event => {
      if (event.sender !== mainWindow?.webContents || !database) throw new Error('Unauthorized IPC sender')
      return getWorkspaceSummary(database)
    })
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
app.on('before-quit', () => {
  database?.close()
  database = undefined
})
