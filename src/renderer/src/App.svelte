<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { APP_THEME_KEY, loadTheme, saveTheme } from './app-theme'
  import type { AppTheme } from './app-theme'
  import JsonCodeEditor from './JsonCodeEditor.svelte'
  import DependencyTags from './DependencyTags.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import TitlebarCustomize from './TitlebarCustomize.svelte'
  import CommandIcon from './CommandIcon.svelte'
  import {
    DEFAULT_TITLEBAR_PINS, PIN_STORAGE_KEY, loadTitlebarPins, saveTitlebarPins,
    pinCommand, unpinCommand, shiftPinnedCommand, reorderPinnedCommands,
    pinnedTitlebarCommands,
  } from './titlebar-pins'
  import { commandForShortcut, createCommands, runCommand } from './commands'
  import type { Command, CommandId, CommandHandlers, StaticCommandId } from './commands'
  import { parseTicketDraft } from '../../shared/ticket-diagnostics'
  import RevisionDiffDialog from './RevisionDiffDialog.svelte'
  import type { LinkMode, ProjectLinkStatus, ProjectRecord, RevisionRecord, TicketObject, TicketRecord, WorkspaceSummary } from '../../shared/contracts'
  import { validateTicket } from '../../shared/ticket-validation'
  import {
    appendTicketListItem, convertTicketScalarToList, editTicketListItem,
    editTicketScalar, readTicketField, removeTicketListItem
  } from '../../shared/ticket-fields'
  import type { BatchOperation, BatchArrayField, BatchTextField } from '../../shared/batch-operations'
  import {
    contextTicketSelection, formTextContextItems, jsonContextItems,
    listContextItems, nativeTextContextItems, pinContextItems,
    projectContextItems, selectionContextItems, ticketContextItems
  } from '../../shared/context-menu'
  import type { ContextAction, ContextMenuEntry } from '../../shared/context-menu'

  let projects: ProjectRecord[] = []
  let tickets: TicketRecord[] = []
  let summary: WorkspaceSummary = { projectCount: 0, ticketCount: 0 }
  let projectUuid = ''
  let ticketUuid = ''
  let version = ''
  let projectName = ''
  let projectPath = ''
  let editProjectUuid = ''
  let projectFormOpen = false
  let settingsOpen = false
  let settingsTab: 'app' | 'project' = 'app'
  let interfaceDensity: 'comfortable' | 'compact' = 'comfortable'
  let appTheme: AppTheme = 'dark'
  const DENSITY_STORAGE_KEY = 'tickets-editor.interface-density.v1'
  let commandPaletteOpen = false
  let titlebarCustomizeOpen = false
  let pinnedCommandIds: StaticCommandId[] = [...DEFAULT_TITLEBAR_PINS]
  let draggedPinId: StaticCommandId | null = null
  let dropTargetPinId: StaticCommandId | null = null
  let customizeToggle: HTMLButtonElement
  let search = ''
  let draft: TicketObject = {}
  let rawJson = ''
  let editorSession = 0
  let jsonEditor: JsonCodeEditor | undefined
  let parseError = ''
  let error = ''
  let message = ''
  let dirty = false
  let busy = false
  let linkMode: LinkMode = 'hardlink'
  let linkStatus: ProjectLinkStatus | null = null
  let revisions: RevisionRecord[] = []
  let diffRevisionId = 0
  let diffOpen = false
  let selectedTicketIds: string[] = []
  let selectionAnchor = ''
  let showBatchEditor = false
  let batchKind: 'append' | 'remove' | 'replace' = 'append'
  let batchField: BatchArrayField = 'deps'
  let batchTextField: BatchTextField = 'all'
  let batchValue = ''
  let findText = ''
  let replaceText = ''
  let exportFormat: 'compact' | 'pretty' | 'jsonl' = 'compact'

  function project(): ProjectRecord | undefined {
    return projects.find(item => item.projectUuid === projectUuid)
  }

  function ticket(): TicketRecord | undefined {
    return tickets.find(item => item.ticketUuid === ticketUuid)
  }

  function visibleTickets(): TicketRecord[] {
    const filter = search.trim().toLowerCase()
    return filter ? tickets.filter(item =>
      JSON.stringify(item.payload).toLowerCase().includes(filter)
      || item.ticketId.toLowerCase().includes(filter)
    ) : tickets
  }

  function textValue(key: string): string {
    return typeof draft[key] === 'string' ? draft[key] as string : ''
  }

  function changeDraft(next: TicketObject): void {
    // Never overwrite malformed JSON from a form edit. The user must first
    // correct the raw text in CodeMirror, where the last valid draft survives.
    if (parseError) return
    const text = JSON.stringify(next, null, 2)
    if (jsonEditor) jsonEditor.replaceDocument(text)
    else changeJson(text)
  }

  function changeText(key: string, value: string): void {
    changeDraft({ ...draft, [key]: value })
  }

  function changeScalar(key: string, value: string): void {
    changeDraft(editTicketScalar(draft, key, value))
  }

  function changeItem(key: string, index: number, value: string): void {
    changeDraft(editTicketListItem(draft, key, index, value))
  }

  function appendItem(key: string): void {
    changeDraft(appendTicketListItem(draft, key))
  }

  function removeItem(key: string, index: number): void {
    changeDraft(removeTicketListItem(draft, key, index))
  }

  function convertToList(key: string): void {
    changeDraft(convertTicketScalarToList(draft, key))
  }

  function changeJson(value: string): void {
    rawJson = value
    dirty = true
    message = ''
    const result = parseTicketDraft(value)
    parseError = result.parseError ?? ''
    if (result.ticket) draft = result.ticket
  }

  function formatJson(): void {
    if (parseError || !jsonEditor) return
    jsonEditor.replaceDocument(JSON.stringify(draft, null, 2))
    jsonEditor.focusEditor()
  }

  function openTicket(item: TicketRecord): void {
    if (dirty && !window.confirm('Discard unsaved changes to this ticket?')) return
    ticketUuid = item.ticketUuid
    selectedTicketIds = [item.ticketUuid]
    selectionAnchor = item.ticketUuid
    draft = structuredClone(item.payload)
    rawJson = JSON.stringify(draft, null, 2)
    editorSession++
    parseError = ''
    dirty = false
    message = ''
  }

  function clearTicket(): void {
    ticketUuid = ''
    selectedTicketIds = []
    draft = {}
    rawJson = ''
    editorSession++
    dirty = false
    parseError = ''
  }

  function selectTicket(event: MouseEvent, item: TicketRecord): void {
    const visible = visibleTickets()
    if (event.shiftKey && selectionAnchor) {
      const first = visible.findIndex(entry => entry.ticketUuid === selectionAnchor)
      const last = visible.findIndex(entry => entry.ticketUuid === item.ticketUuid)
      if (first >= 0 && last >= 0) {
        selectedTicketIds = Array.from(new Set([
          ...selectedTicketIds,
          ...visible.slice(Math.min(first, last), Math.max(first, last) + 1).map(entry => entry.ticketUuid)
        ]))
        return
      }
    }
    if (event.ctrlKey || event.metaKey) {
      selectedTicketIds = selectedTicketIds.includes(item.ticketUuid)
        ? selectedTicketIds.filter(id => id !== item.ticketUuid)
        : [...selectedTicketIds, item.ticketUuid]
      selectionAnchor = item.ticketUuid
      return
    }
    openTicket(item)
  }

  function selectVisibleTickets(): void {
    selectedTicketIds = visibleTickets().map(item => item.ticketUuid)
    selectionAnchor = selectedTicketIds.at(-1) ?? ''
  }

  async function applyBatchEdit(): Promise<void> {
    if (!projectUuid || !selectedTicketIds.length || busy) return
    if (dirty && !window.confirm('Discard unsaved edits before batch operation?')) return
    const operation: BatchOperation = batchKind === 'replace'
      ? { kind: 'replace', field: batchTextField, find: findText, replacement: replaceText }
      : { kind: batchKind, field: batchField, value: batchValue }
    busy = true
    try {
      const count = await window.ticketsEditor.batchEditTickets(projectUuid, selectedTicketIds, operation)
      dirty = false
      await reload(ticketUuid)
      message = 'Updated ' + count + ' tickets in one operation'
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function duplicateSelection(): Promise<void> {
    if (!projectUuid || !selectedTicketIds.length || busy) return
    if (dirty && !window.confirm('Discard unsaved edits before duplication?')) return
    busy = true
    try {
      const count = await window.ticketsEditor.duplicateTickets(projectUuid, selectedTicketIds)
      dirty = false
      await reload(ticketUuid)
      message = 'Duplicated ' + count + ' tickets with new IDs'
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function deleteSelection(): Promise<void> {
    if (!projectUuid || !selectedTicketIds.length || busy) return
    if (dirty && !window.confirm('Discard unsaved ticket edits before deleting selected tickets?')) return
    const count = selectedTicketIds.length
    if (!window.confirm('Delete ' + count + ' selected tickets? This creates a SQLite revision first.')) return
    busy = true
    try {
      await window.ticketsEditor.deleteSelectedTickets(projectUuid, selectedTicketIds)
      dirty = false
      selectedTicketIds = []
      ticketUuid = ''
      await reload()
      message = 'Deleted ' + count + ' tickets'
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function saveExport(scope: 'selection' | 'project'): Promise<void> {
    if (!projectUuid) return
    try {
      const path = await window.ticketsEditor.exportTickets(projectUuid, scope, selectedTicketIds, exportFormat)
      if (path) {
        message = 'Exported tickets to ' + path
        error = ''
      }
    } catch (cause) {
      showError(cause)
    }
  }

  async function moveSelection(direction: 'up' | 'down'): Promise<void> {
    if (!projectUuid || !selectedTicketIds.length || busy) return
    if (dirty && !window.confirm('Discard unsaved edits before moving tickets?')) return
    busy = true
    try {
      await window.ticketsEditor.moveTickets(projectUuid, selectedTicketIds, direction)
      dirty = false
      await reload(ticketUuid)
      message = 'Moved selected tickets ' + direction
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function copyTickets(scope: 'selection' | 'project'): Promise<void> {
    if (!projectUuid) return
    try {
      const value = scope === 'selection'
        ? tickets.filter(item => selectedTicketIds.includes(item.ticketUuid)).map(item => item.payload)
        : (await window.ticketsEditor.getProjectDocument(projectUuid)).document
      const contents = exportFormat === 'jsonl'
        ? (Array.isArray(value) ? value : [value]).map(row => JSON.stringify(row)).join('\n')
        : JSON.stringify(value, null, exportFormat === 'pretty' ? 2 : undefined)
      await navigator.clipboard.writeText(contents)
      message = 'Copied ' + (scope === 'selection' ? selectedTicketIds.length + ' selected tickets' : 'full project document')
      error = ''
    } catch (cause) {
      showError(cause)
    }
  }

  function showError(cause: unknown): void {
    error = cause instanceof Error ? cause.message : String(cause)
    message = ''
  }

  async function reload(preferredTicketUuid = ''): Promise<void> {
    projects = await window.ticketsEditor.listProjects()
    summary = await window.ticketsEditor.getSummary()
    if (!projectUuid) {
      tickets = []
      linkStatus = null
      revisions = []
      clearTicket()
      return
    }
    linkStatus = await window.ticketsEditor.getProjectLinkStatus(projectUuid)
    if (linkStatus.mode) linkMode = linkStatus.mode
    tickets = await window.ticketsEditor.listTickets(projectUuid)
    revisions = await window.ticketsEditor.listProjectRevisions(projectUuid)
    const preservedSelection = selectedTicketIds.filter(id => tickets.some(item => item.ticketUuid === id))
    const next = tickets.find(item => item.ticketUuid === preferredTicketUuid) ??
      tickets.find(item => item.ticketUuid === ticketUuid) ?? tickets[0]
    clearTicket()
    if (next) openTicket(next)
    if (preservedSelection.length) selectedTicketIds = preservedSelection
  }

  async function selectProject(id: string): Promise<boolean> {
    if (id === projectUuid) return true
    if (busy || (dirty && !window.confirm('Discard unsaved changes to this ticket?'))) {
      return false
    }
    projectUuid = id
    clearTicket()
    try {
      error = ''
      await reload()
      return true
    } catch (cause) {
      showError(cause)
      return false
    }
  }

  onMount(() => {
    pinnedCommandIds = loadTitlebarPins(pinStorage)
    appTheme = loadTheme(window.localStorage)
    document.documentElement.dataset.theme = appTheme
    void window.ticketsEditor.setTheme(appTheme).catch(showError)
    try {
      const storedDensity = window.localStorage.getItem(DENSITY_STORAGE_KEY)
      if (storedDensity === 'comfortable' || storedDensity === 'compact') {
        interfaceDensity = storedDensity
      }
    } catch {
      // Storage failures must not prevent the editor from opening.
    }
    const onStorageChange = (event: StorageEvent): void => {
      if (event.key === PIN_STORAGE_KEY) pinnedCommandIds = loadTitlebarPins(pinStorage)
      if (event.key === APP_THEME_KEY) {
        appTheme = loadTheme(window.localStorage)
        document.documentElement.dataset.theme = appTheme
        void window.ticketsEditor.setTheme(appTheme).catch(showError)
      }
    }
    window.addEventListener('storage', onStorageChange)
    const unsubscribe = window.ticketsEditor.onProjectLinkChanged(() => { void verifyLink(false) })
    void (async () => {
      try {
        version = await window.ticketsEditor.getVersion()
        projects = await window.ticketsEditor.listProjects()
        projectUuid = projects[0]?.projectUuid ?? ''
        await reload()
      } catch (cause) {
        showError(cause)
      }
    })()
    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorageChange)
    }
  })

  function addProjectForm(): void {
    editProjectUuid = ''
    projectName = ''
    projectPath = ''
    projectFormOpen = true
  }

  function openSettings(tab: 'app' | 'project' = 'app'): void {
    if (projectFormOpen || diffOpen) return
    const current = project()
    editProjectUuid = current?.projectUuid ?? ''
    projectName = current?.name ?? ''
    projectPath = current?.rootPath ?? ''
    settingsTab = tab === 'project' && current ? 'project' : 'app'
    titlebarCustomizeOpen = false
    settingsOpen = true
    if (current) void loadRevisions()
    void tick().then(() => {
      if (settingsOpen) document.getElementById(
        settingsTab === 'app' ? 'settings-tab-application' : 'settings-tab-project',
      )?.focus()
    })
  }

  function editProjectForm(): void {
    openSettings('project')
  }

  function closeSettings(): void {
    settingsOpen = false
  }

  function setAppTheme(value: string): void {
    if (value !== 'dark' && value !== 'light') return
    appTheme = value
    document.documentElement.dataset.theme = value
    if (!saveTheme(window.localStorage, value)) {
      error = 'Theme changed, but your preference could not be saved.'
    }
    void window.ticketsEditor.setTheme(value).catch(showError)
  }

  function setInterfaceDensity(value: string): void {
    if (value !== 'comfortable' && value !== 'compact') return
    interfaceDensity = value
    try {
      window.localStorage.setItem(DENSITY_STORAGE_KEY, value)
    } catch {
      error = 'Interface density changed, but the preference could not be saved.'
    }
  }

  function customizeFromSettings(): void {
    closeSettings()
    void tick().then(() => openTitlebarCustomize())
  }

  function openRevisionDiff(revisionId: number): void {
    diffRevisionId = revisionId
    diffOpen = true
  }

  async function loadRevisions(): Promise<void> {
    if (!projectUuid) return
    try { revisions = await window.ticketsEditor.listProjectRevisions(projectUuid) }
    catch (cause) { showError(cause) }
  }

  async function pickDirectory(): Promise<void> {
    try {
      const path = await window.ticketsEditor.chooseProjectDirectory()
      if (path) {
        projectPath = path
        if (!projectName) projectName = path.split(/[\\/]/u).filter(Boolean).at(-1) ?? ''
      }
    } catch (cause) {
      showError(cause)
    }
  }

  async function saveProject(): Promise<void> {
    if (busy) return
    busy = true
    try {
      const input = { name: projectName, rootPath: projectPath }
      const result = editProjectUuid
        ? await window.ticketsEditor.updateProject(editProjectUuid, input)
        : await window.ticketsEditor.registerProject(input)
      projectUuid = result.projectUuid
      clearTicket()
      const wasEditing = !!editProjectUuid
      projectFormOpen = false
      settingsOpen = false
      await reload()
      message = wasEditing ? 'Project settings saved' : 'Project registered in SQLite'
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function verifyLink(announce = true): Promise<void> {
    if (!projectUuid) return
    try {
      linkStatus = await window.ticketsEditor.getProjectLinkStatus(projectUuid)
      if (linkStatus.mode) linkMode = linkStatus.mode
      if (announce) message = linkStatus.details
      if (announce) error = ''
    } catch (cause) {
      showError(cause)
    }
  }

  async function setupLink(): Promise<void> {
    if (!projectUuid || busy) return
    busy = true
    try {
      linkStatus = await window.ticketsEditor.setupProjectLink(projectUuid, linkMode)
      message = linkStatus.details
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function importExternalChanges(source: 'canonical' | 'detached' = 'canonical'): Promise<void> {
    if (!projectUuid || busy) return
    if (dirty && !window.confirm('Discard unsaved local changes before importing?')) return
    busy = true
    try {
      const imported = await window.ticketsEditor.importExternalChanges(projectUuid, source)
      if (imported) {
        clearTicket()
        await reload()
        await loadRevisions()
        message = 'External document imported into SQLite; changes preserved in recovery'
        error = ''
      }
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function recoverFromSqlite(): Promise<void> {
    if (!projectUuid || busy) return
    busy = true
    try {
      const completed = await window.ticketsEditor.recoverFromSqlite(projectUuid)
      if (completed) {
        await verifyLink()
        message = 'AppData JSON restored from SQLite; backups saved'
      }
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function repairLink(): Promise<void> {
    if (!projectUuid || busy) return
    busy = true
    try {
      const repaired = await window.ticketsEditor.repairProjectLink(projectUuid)
      if (repaired) {
        linkStatus = repaired
        message = 'Project link repaired; detached contents backed up'
        error = ''
      }
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function restoreRevision(revisionId: number): Promise<void> {
    if (!projectUuid || busy) return
    if (dirty && !window.confirm('Discard unsaved edits before restoring?')) return
    busy = true
    try {
      const restored = await window.ticketsEditor.restoreProjectRevision(projectUuid, revisionId)
      if (restored) {
        clearTicket()
        await reload()
        await loadRevisions()
        message = 'Revision restored; previous state retained in history'
        error = ''
      }
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function unregisterProject(targetId = projectUuid): Promise<void> {
    if (busy) return
    const target = projects.find(item => item.projectUuid === targetId)
    if (!target) return
    if (targetId === projectUuid && dirty &&
      !window.confirm('Discard unsaved ticket changes before unregistering this project?')) return
    if (!window.confirm('Unregister ' + target.name + '? Project files will not be deleted.')) return
    busy = true
    try {
      await window.ticketsEditor.removeProject(targetId)
      if (targetId === projectUuid) {
        settingsOpen = false
        projectUuid = ''
        clearTicket()
        projects = await window.ticketsEditor.listProjects()
        projectUuid = projects[0]?.projectUuid ?? ''
        await reload()
      } else {
        projects = await window.ticketsEditor.listProjects()
        summary = await window.ticketsEditor.getSummary()
      }
      message = 'Project unregistered'
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function createTicket(): Promise<void> {
    if (!projectUuid || busy) return
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    busy = true
    try {
      const created = await window.ticketsEditor.createTicket(projectUuid)
      await reload(created.ticketUuid)
      message = 'Ticket created'
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function saveTicket(): Promise<void> {
    if (!projectUuid || !ticketUuid || !dirty || busy) return
    if (parseError) { error = 'Fix the JSON syntax before saving'; return }
    busy = true
    try {
      const saved = await window.ticketsEditor.updateTicket(projectUuid, ticketUuid, draft, ticket()?.payload)
      await reload(saved.ticketUuid)
      message = 'Saved to SQLite'
      error = ''
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  async function deleteTicket(): Promise<void> {
    if (!projectUuid || !ticketUuid || !window.confirm('Delete this ticket?')) return
    try {
      await window.ticketsEditor.deleteTicket(projectUuid, ticketUuid)
      clearTicket()
      await reload()
      message = 'Ticket deleted'
    } catch (cause) {
      showError(cause)
    }
  }

  async function importTickets(): Promise<void> {
    if (!projectUuid || busy) return
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    busy = true
    try {
      const imported = await window.ticketsEditor.importProjectDocument(projectUuid)
      if (imported) {
        clearTicket()
        await reload()
        message = 'Imported ' + imported.ticketCount + ' tickets'
      }
    } catch (cause) {
      showError(cause)
    } finally {
      busy = false
    }
  }

  function focusTicketSearch(): void {
    document.getElementById('ticket-search')?.focus()
  }

  function openCommandPalette(): void {
    if (projectFormOpen || settingsOpen || diffOpen) return
    commandPaletteOpen = true
  }

  function closeCommandPalette(): void {
    commandPaletteOpen = false
  }

  function clearSelection(): void {
    selectedTicketIds = []
    selectionAnchor = ''
  }

  const pinStorage = {
    getItem: (key: string): string | null => window.localStorage.getItem(key),
    setItem: (key: string, value: string): void => window.localStorage.setItem(key, value),
  }

  function updateTitlebarPins(next: StaticCommandId[]): void {
    pinnedCommandIds = next
    if (!saveTitlebarPins(pinStorage, next)) {
      error = 'Title-bar commands changed, but your preferences could not be saved.'
    }
  }

  function addTitlebarPin(id: StaticCommandId): void {
    updateTitlebarPins(pinCommand(pinnedCommandIds, id))
  }

  function removeTitlebarPin(id: StaticCommandId): void {
    updateTitlebarPins(unpinCommand(pinnedCommandIds, id))
  }

  function moveTitlebarPin(id: StaticCommandId, direction: -1 | 1): void {
    updateTitlebarPins(shiftPinnedCommand(pinnedCommandIds, id, direction))
  }

  function resetTitlebarPins(): void {
    updateTitlebarPins([...DEFAULT_TITLEBAR_PINS])
  }

  function openTitlebarCustomize(): void {
    titlebarCustomizeOpen = true
  }

  function closeTitlebarCustomize(): void {
    titlebarCustomizeOpen = false
    void tick().then(() => customizeToggle?.focus())
  }

  function toggleTitlebarCustomize(): void {
    if (titlebarCustomizeOpen) closeTitlebarCustomize()
    else openTitlebarCustomize()
  }

  function onTitlebarOutsidePointer(event: PointerEvent): void {
    if (!titlebarCustomizeOpen) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('.titlebar-customizer') ||
      target.closest('[data-titlebar-customize]')) return
    titlebarCustomizeOpen = false
  }

  function onPinDragStart(event: DragEvent, id: StaticCommandId): void {
    if (!event.dataTransfer) return
    draggedPinId = id
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function onPinDragOver(event: DragEvent, id: StaticCommandId): void {
    if (!draggedPinId || draggedPinId === id) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dropTargetPinId = id
  }

  function onPinDrop(event: DragEvent, id: StaticCommandId): void {
    if (!draggedPinId) return
    event.preventDefault()
    updateTitlebarPins(reorderPinnedCommands(pinnedCommandIds, draggedPinId, id))
    onPinDragEnd()
  }

  function onPinDragEnd(): void {
    draggedPinId = null
    dropTargetPinId = null
  }

  const handlers: CommandHandlers = {
    'palette.open': openCommandPalette,
    'titlebar.customize': toggleTitlebarCustomize,
    'app.settings': () => openSettings('app'),
    'project.register': addProjectForm,
    'project.settings': editProjectForm,
    'project.search': focusTicketSearch,
    'project.import': importTickets,
    'project.copy': () => copyTickets('project'),
    'project.export': () => saveExport('project'),
    'ticket.new': createTicket,
    'ticket.save': saveTicket,
    'ticket.delete': deleteTicket,
    'ticket.format': formatJson,
    'ticket.undo': () => { jsonEditor?.undoEdit() },
    'ticket.redo': () => { jsonEditor?.redoEdit() },
    'ticket.copySelection': () => copyTickets('selection'),
    'ticket.exportSelection': () => saveExport('selection'),
    'ticket.selectVisible': selectVisibleTickets,
    'ticket.clearSelection': clearSelection,
    'ticket.batchEdit': () => { showBatchEditor = true },
    'ticket.duplicate': duplicateSelection,
    'ticket.moveUp': () => moveSelection('up'),
    'ticket.moveDown': () => moveSelection('down'),
    'ticket.deleteSelection': deleteSelection,
    'project.compareRevision': () => {
      if (revisions[0]) openRevisionDiff(revisions[0].revisionId)
    },
    'project.verifyLink': () => verifyLink(),
  }

  function buildCommands(
    activeProject: string,
    activeTicket: string,
    unsaved: boolean,
    invalidJson: boolean,
    isBusy: boolean,
    selectedCount: number,
    revisionCount: number,
    registeredProjects: ProjectRecord[],
  ): Command[] {
    return createCommands({
      hasProject: !!activeProject,
      hasTicket: !!activeTicket,
      dirty: unsaved,
      invalidJson,
      busy: isBusy,
      selectionCount: selectedCount,
      revisionCount,
    }, handlers, registeredProjects, (id) => { void selectProject(id) })
  }

  function currentCommands(): Command[] {
    return buildCommands(
      projectUuid, ticketUuid, dirty, !!parseError, busy,
      selectedTicketIds.length, revisions.length, projects,
    )
  }

  function executeCommand(id: CommandId): void {
    runCommand(currentCommands(), id)
  }

  async function executePaletteCommand(id: CommandId): Promise<void> {
    closeCommandPalette()
    // Release the native modal before focusing another field or opening a dialog.
    await tick()
    executeCommand(id)
  }


  /**
   * Native OS menus. Every action is returned through the validated preload
   * bridge. No right-click action should discard drafts or switch tickets just
   * because a different item was clicked.
   */
  async function popupContextMenu(
    event: MouseEvent,
    items: ContextMenuEntry[],
    action: (selected: ContextAction) => void | Promise<void>
  ): Promise<void> {
    event.preventDefault()
    event.stopPropagation()
    if (!items.length) return
    try {
      const selected = await window.ticketsEditor.showContextMenu({
        items, x: event.clientX, y: event.clientY
      })
      if (selected) await action(selected)
    } catch (cause) {
      showError(cause)
    }
  }

  function ticketContextMenu(event: MouseEvent, target: TicketRecord): void {
    const selection = contextTicketSelection(target.ticketUuid, selectedTicketIds)
    selectedTicketIds = selection
    selectionAnchor = target.ticketUuid
    const originalProject = projectUuid
    void popupContextMenu(event, ticketContextItems(selection.length, busy), async selected => {
      if (originalProject !== projectUuid || busy ||
        !tickets.some(item => item.ticketUuid === target.ticketUuid)) return
      // The selection is captured, not inferred from a later active ticket.
      selectedTicketIds = selection.filter(id => tickets.some(item => item.ticketUuid === id))
      switch (selected) {
        case 'ticket.open':
          openTicket(target)
          break
        case 'ticket.copyId':
          await navigator.clipboard.writeText(target.ticketId)
          message = 'Copied ticket ID'
          error = ''
          break
        case 'ticket.copy': {
          const payloads = tickets.filter(item => selectedTicketIds.includes(item.ticketUuid))
            .map(item => item.payload)
          const value = payloads.length === 1 ? payloads[0] : payloads
          const contents = exportFormat === 'jsonl'
            ? payloads.map(row => JSON.stringify(row)).join('\n')
            : JSON.stringify(value, null, exportFormat === 'pretty' ? 2 : undefined)
          await navigator.clipboard.writeText(contents)
          message = 'Copied ' + payloads.length + ' ticket(s)'
          error = ''
          break
        }
        case 'ticket.export':
          await saveExport('selection')
          break
        case 'ticket.duplicate':
          await duplicateSelection()
          break
        case 'ticket.moveUp':
          await moveSelection('up')
          break
        case 'ticket.moveDown':
          await moveSelection('down')
          break
        case 'ticket.batchEdit':
          showBatchEditor = true
          break
        case 'ticket.delete':
          await deleteSelection()
          break
      }
    })
  }

  function projectContextMenu(event: MouseEvent, target: ProjectRecord): void {
    void popupContextMenu(
      event, projectContextItems(target.projectUuid === projectUuid, busy),
      async selected => {
        if (busy || !projects.some(item => item.projectUuid === target.projectUuid)) return
        switch (selected) {
          case 'project.switch':
            await selectProject(target.projectUuid)
            break
          case 'project.settings':
            if (await selectProject(target.projectUuid)) openSettings('project')
            break
          case 'project.copyPath':
            await navigator.clipboard.writeText(target.rootPath)
            message = 'Copied project directory'
            error = ''
            break
          case 'project.copy': {
            const document = (await window.ticketsEditor.getProjectDocument(target.projectUuid)).document
            const value = exportFormat === 'jsonl'
              ? (Array.isArray(document) ? document : [document]).map(row => JSON.stringify(row)).join('\n')
              : JSON.stringify(document, null, exportFormat === 'pretty' ? 2 : undefined)
            await navigator.clipboard.writeText(value)
            message = 'Copied project JSON'
            error = ''
            break
          }
          case 'project.export': {
            const path = await window.ticketsEditor.exportTickets(target.projectUuid, 'project', [], exportFormat)
            if (path) { message = 'Exported project to ' + path; error = '' }
            break
          }
          case 'project.import':
            if (await selectProject(target.projectUuid)) await importTickets()
            break
          case 'project.unregister':
            await unregisterProject(target.projectUuid)
            break
        }
      }
    )
  }

  function pinContextMenu(event: MouseEvent, id: StaticCommandId, title: string,
    available: boolean): void {
    const index = pinnedCommandIds.indexOf(id)
    if (index < 0) return
    void popupContextMenu(
      event, pinContextItems(title, available, index, pinnedCommandIds.length),
      selected => {
        if (!pinnedCommandIds.includes(id)) return
        switch (selected) {
          case 'pin.run':
            executeCommand(id)
            break
          case 'pin.unpin':
            removeTitlebarPin(id)
            break
          case 'pin.moveLeft':
            moveTitlebarPin(id, -1)
            break
          case 'pin.moveRight':
            moveTitlebarPin(id, 1)
            break
          case 'pin.customize':
            openTitlebarCustomize()
            break
        }
      }
    )
  }

  function listContextMenu(event: MouseEvent): void {
    void popupContextMenu(event, listContextItems(!!projectUuid, busy, selectedTicketIds.length),
      selected => {
        switch (selected) {
          case 'list.new': executeCommand('ticket.new'); break
          case 'list.import': executeCommand('project.import'); break
          case 'list.selectVisible': executeCommand('ticket.selectVisible'); break
          case 'list.clearSelection': executeCommand('ticket.clearSelection'); break
        }
      })
  }

  async function jsonMenuAction(selected: ContextAction): Promise<void> {
    switch (selected) {
      case 'json.undo':
        jsonEditor?.undoEdit()
        break
      case 'json.redo':
        jsonEditor?.redoEdit()
        break
      case 'json.cut':
        await jsonEditor?.copySelectedText(true)
        break
      case 'json.copy':
        await jsonEditor?.copySelectedText()
        break
      case 'json.paste':
        await jsonEditor?.pasteText()
        break
      case 'json.selectAll':
        jsonEditor?.selectAllText()
        break
      case 'json.format':
        executeCommand('ticket.format')
        break
    }
  }

  function onGenericContextMenu(event: MouseEvent): void {
    if (event.defaultPrevented || !(event.target instanceof Element)) return
    const target = event.target
    if (target.closest('.json-code-shell')) {
      void popupContextMenu(event, jsonContextItems(
        jsonEditor?.canUndoEdit() ?? false,
        jsonEditor?.canRedoEdit() ?? false,
        jsonEditor?.hasSelectedText() ?? false,
        !!ticket() && !parseError
      ), jsonMenuAction)
      return
    }

    const editable = target.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')
    if (editable) {
      const input = editable instanceof HTMLInputElement ? editable : null
      const supportsText = !input || /^(text|search|email|url|tel|password|number)$/u.test(input.type)
      if (!supportsText || (editable instanceof HTMLInputElement && editable.disabled) ||
        (editable instanceof HTMLTextAreaElement && editable.disabled)) return
      const form = editable.closest('.human-body')
      const items = form && jsonEditor
        ? formTextContextItems(jsonEditor.canUndoEdit(), jsonEditor.canRedoEdit())
        : nativeTextContextItems()
      void popupContextMenu(event, items, jsonMenuAction)
      return
    }

    if (window.getSelection()?.toString().trim()) {
      void popupContextMenu(event, selectionContextItems(), () => {})
    }
  }

  function onHotkey(event: KeyboardEvent): void {
    if (settingsOpen) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSettings()
      }
      return
    }
    if (titlebarCustomizeOpen) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeTitlebarCustomize()
      }
      return
    }
    if (event.defaultPrevented || event.isComposing || commandPaletteOpen ||
      projectFormOpen || diffOpen) return

    const modified = (event.ctrlKey || event.metaKey) && !event.altKey &&
      !(event.ctrlKey && event.metaKey)
    const key = event.key.toLowerCase()
    const fromForm = event.target instanceof Element &&
      event.target.closest('.human-body') !== null

    if (fromForm && modified && (key === 'z' || key === 'y')) {
      event.preventDefault()
      // Form changes also enter CodeMirror history; use one undo stack.
      executeCommand(key === 'y' || event.shiftKey ? 'ticket.redo' : 'ticket.undo')
      return
    }

    const match = commandForShortcut(currentCommands(), event)
    if (!match) return
    event.preventDefault()
    executeCommand(match.id)
  }

</script>

<svelte:window onkeydown={onHotkey} onpointerdown={onTitlebarOutsidePointer} oncontextmenu={onGenericContextMenu} />

<div class="app" class:compact={interfaceDensity === 'compact'}>
  <header class="titlebar">
    <div class="brand" title="TicketsEditor" aria-label="TicketsEditor"><span class="brand-icon" aria-hidden="true">T</span></div>
    <div class="tabs">
      {#each projects as p (p.projectUuid)}
        <button class:active={p.projectUuid === projectUuid} class="tab" title={p.rootPath} onclick={() => executeCommand(`project.switch:${p.projectUuid}`)} oncontextmenu={(event) => projectContextMenu(event, p)}>▣ {p.name}</button>
      {/each}
      <button class="title-action" title="Register project" aria-label="Register project" onclick={() => executeCommand('project.register')}><CommandIcon id="project.register" /></button>
    </div>
    <div class="drag-space"></div>
    <div class="title-actions">
      <div class="title-pins" role="group" aria-label="Pinned commands">
        {#each pinnedTitlebarCommands(pinnedCommandIds, buildCommands(
          projectUuid, ticketUuid, dirty, !!parseError, busy,
          selectedTicketIds.length, revisions.length, projects,
        )) as command (command.id)}
          <span
            class="title-pin-slot"
            role="group"
            aria-label={'Pinned ' + command.title + '; drag to reorder'}
            class:drop-target={dropTargetPinId === command.id}
            draggable="true"
            ondragstart={(event) => onPinDragStart(event, command.id as StaticCommandId)}
            ondragover={(event) => onPinDragOver(event, command.id as StaticCommandId)}
            ondrop={(event) => onPinDrop(event, command.id as StaticCommandId)}
            ondragend={onPinDragEnd}
            oncontextmenu={(event) => pinContextMenu(
              event, command.id as StaticCommandId, command.title, command.enabled
            )}
          >
            <button
              class="title-action title-pinned-action"
              type="button"
              title={command.title + ' · Right-click for actions'}
              aria-label={command.title}
              disabled={!command.enabled}
              onclick={() => executeCommand(command.id)}
            ><CommandIcon id={command.id} fallback={command.icon} /></button>
          </span>
        {/each}
      </div>
    </div>
    <button
      bind:this={customizeToggle}
      class="title-action titlebar-customize-trigger"
      type="button"
      data-titlebar-customize
      aria-label="Customize title-bar commands"
      aria-haspopup="dialog"
      aria-expanded={titlebarCustomizeOpen}
      title="Pin or reorder title-bar commands"
      onclick={() => executeCommand('titlebar.customize')}
    ><CommandIcon id="titlebar.customize" /></button>
    <button
      class="title-action titlebar-settings-trigger"
      type="button"
      title="Settings"
      aria-label="Open settings"
      aria-haspopup="dialog"
      aria-expanded={settingsOpen}
      onclick={() => executeCommand('app.settings')}
    ><CommandIcon id="app.settings" /></button>
    <div class="caption-reserved"></div>
    {#if titlebarCustomizeOpen}
      <TitlebarCustomize
        commands={buildCommands(
          projectUuid, ticketUuid, dirty, !!parseError, busy,
          selectedTicketIds.length, revisions.length, projects,
        )}
        pinned={pinnedCommandIds}
        pin={addTitlebarPin}
        unpin={removeTitlebarPin}
        move={moveTitlebarPin}
        reset={resetTitlebarPins}
        close={closeTitlebarCustomize}
      />
    {/if}
  </header>

  {#if projectFormOpen || settingsOpen}
    <div class="dialog-shade">
      <dialog class="project-dialog" class:settings-dialog={settingsOpen} open aria-label={settingsOpen ? 'Settings' : 'Register project'}>
        {#if settingsOpen}
          <div class="settings-header">
            <div>
              <h2>Settings</h2>
              <p>Application preferences and project management</p>
            </div>
            <button class="settings-close" type="button" aria-label="Close settings" onclick={closeSettings}>×</button>
          </div>
          <div class="settings-tabs" role="tablist" aria-label="Settings sections">
            <button
              id="settings-tab-application"
              type="button"
              role="tab"
              aria-controls="settings-tab-panel"
              aria-selected={settingsTab === 'app'}
              class:active={settingsTab === 'app'}
              onclick={() => { settingsTab = 'app' }}
            >Application</button>
            <button
              id="settings-tab-project"
              type="button"
              role="tab"
              aria-controls="settings-tab-panel"
              aria-selected={settingsTab === 'project'}
              class:active={settingsTab === 'project'}
              disabled={!projectUuid}
              onclick={() => { settingsTab = 'project' }}
            >Project</button>
          </div>
        {:else}
          <h2>Register project</h2>
          <p>Choose the full path to an existing project directory.</p>
        {/if}

        {#if settingsOpen && settingsTab === 'app'}
          <div class="settings-content" id="settings-tab-panel" role="tabpanel" aria-labelledby="settings-tab-application">
            <section class="settings-section">
              <h3>Appearance</h3>
              <label for="app-theme">Theme</label>
              <select
                id="app-theme"
                value={appTheme}
                onchange={(event) => setAppTheme((event.currentTarget as HTMLSelectElement).value)}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <p class="settings-description">Dark is the default. The chosen theme is saved for future sessions.</p>
              <label for="interface-density">Interface density</label>
              <select
                id="interface-density"
                value={interfaceDensity}
                onchange={(event) => setInterfaceDensity((event.currentTarget as HTMLSelectElement).value)}
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
              <p class="settings-description">Adjust spacing in the ticket list and editor without changing your data.</p>
            </section>
            <section class="settings-section">
              <h3>Title bar</h3>
              <p class="settings-description">{pinnedCommandIds.length} pinned commands. Configure the shortcuts shown next to the Windows controls.</p>
              <div class="settings-button-row">
                <button type="button" onclick={customizeFromSettings}>Customize pinned commands</button>
                <button type="button" onclick={resetTitlebarPins}>Restore defaults</button>
              </div>
            </section>
            <section class="settings-section">
              <h3>About</h3>
              <p class="settings-description">TicketsEditor v{version || '0.5.0'} · Local SQLite workspace</p>
            </section>
          </div>
          <div class="dialog-actions settings-footer">
            <button type="button" class="primary" onclick={closeSettings}>Done</button>
          </div>
        {:else}
          <div
            class="settings-content"
            class:registration-content={!settingsOpen}
            id={settingsOpen ? 'settings-tab-panel' : undefined}
            role={settingsOpen ? 'tabpanel' : undefined}
            aria-labelledby={settingsOpen ? 'settings-tab-project' : undefined}
          >
            {#if settingsOpen}
              <div class="settings-project-intro">
                <h3>{project()?.name ?? 'Project'}</h3>
                <p>Configure this project's directory, linked .tickets file, and revision history.</p>
              </div>
            {/if}
            <div class="settings-fields">
              <label for="project-name">Project name</label>
              <input id="project-name" bind:value={projectName} placeholder="DLL Viewer" />
              <label for="project-path">Absolute project directory</label>
              <div class="path-input">
                <input id="project-path" bind:value={projectPath} placeholder="C:\Projects\DLLViewer" />
                <button onclick={() => void pickDirectory()}>Browse…</button>
              </div>
            </div>
        {#if settingsOpen && linkStatus}
          <div class="link-panel">
            <h3>Project .tickets link</h3>
            <p>{linkStatus.details}</p>
            <p class="link-path">Source: {linkStatus.canonicalPath}</p>
            <p class="link-path">Project: {linkStatus.projectFilePath}</p>
            <div class="link-operations">
              <label for="link-mode">Link type</label>
              <select id="link-mode" bind:value={linkMode} disabled={linkStatus.health === 'linked'}>
                <option value="hardlink">Hardlink (same volume)</option>
                <option value="symlink">Symbolic link (cross-volume)</option>
              </select>
              <button onclick={() => void setupLink()} disabled={busy || linkStatus.health === 'linked'}>Set Up .tickets Link</button>
              <button onclick={() => void verifyLink()}>Verify Link</button>
            </div>
            {#if linkStatus.health === 'changed' || linkStatus.health === 'conflict'}
              <button disabled={busy} onclick={() => void importExternalChanges()}>Keep external JSON (backup SQLite)</button>
            {/if}
            {#if linkStatus.health === 'conflict' || linkStatus.health === 'broken'}
              <button disabled={busy} onclick={() => void recoverFromSqlite()}>Keep SQLite (backup JSON)</button>
            {/if}
            {#if linkStatus.health === 'broken'}
              <p class="link-warning">A broken link may be a replaced file. Back up its contents and repair after reconciling.</p>
              <div class="link-operations">
                <button disabled={busy} onclick={() => void importExternalChanges('detached')}>Import detached .tickets</button>
                <button disabled={busy} onclick={() => void repairLink()}>Back up and repair link</button>
              </div>
            {/if}
            <div class="revision-panel">
              <div class="section-header">
                <h3>Revision history</h3>
                <button onclick={() => void loadRevisions()}>Refresh</button>
              </div>
              <div class="revision-list">
                {#each revisions.slice(0, 12) as revision (revision.revisionId)}
                  <div class="revision-item">
                    <span>#{revision.revisionId} · {revision.createdAt}</span>
                    <div class="revision-actions">
                      <button onclick={() => openRevisionDiff(revision.revisionId)}>Compare</button>
                      <button disabled={busy} onclick={() => void restoreRevision(revision.revisionId)}>Restore</button>
                    </div>
                  </div>
                {:else}
                  <p>No revisions available.</p>
                {/each}
              </div>
            </div>
          </div>
        {/if}
          </div>
          <div class="dialog-actions" class:settings-footer={settingsOpen}>
            {#if settingsOpen}
              <button type="button" class="danger" disabled={busy} onclick={() => void unregisterProject()}>Unregister project</button>
              <span class="grow"></span>
            {/if}
            <button type="button" onclick={() => { projectFormOpen = false; settingsOpen = false }}>Cancel</button>
            <button type="button" class="primary" disabled={busy || !projectName.trim() || !projectPath.trim()} onclick={() => void saveProject()}>
              {settingsOpen ? 'Save changes' : 'Register project'}
            </button>
          </div>
        {/if}
      </dialog>
    </div>
  {/if}

  {#if diffOpen}
    <RevisionDiffDialog
      {projectUuid}
      projectName={project()?.name ?? 'Project'}
      {revisions}
      initialRevisionId={diffRevisionId}
      close={() => { diffOpen = false }}
    />
  {/if}

  <main class="workspace">
    <aside class="navigator">
      <div class="panel-heading">TICKETS <span>{selectedTicketIds.length} selected / {tickets.length}</span></div>
      {#if projectUuid}
        <input class="search" id="ticket-search" bind:value={search} placeholder="Search tickets…" aria-label="Search tickets" />
        <div class="navigator-controls">
          <button onclick={() => executeCommand('ticket.new')} disabled={busy}>+ New</button>
          <button onclick={() => executeCommand('project.import')} disabled={busy}>Import JSON/JSONL</button>
        </div>
        <div class="select-controls">
          <button onclick={() => executeCommand('ticket.selectVisible')}>Select visible</button>
          <button onclick={() => executeCommand('ticket.clearSelection')}>Clear</button>
          <button onclick={() => { if (showBatchEditor) showBatchEditor = false; else executeCommand('ticket.batchEdit') }} disabled={!selectedTicketIds.length}>Batch edit</button>
        </div>
        {#if showBatchEditor && selectedTicketIds.length}
          <div class="batch-editor">
            <strong>Batch editing · {selectedTicketIds.length} tickets</strong>
            <div class="batch-actions">
              <button onclick={() => executeCommand('ticket.duplicate')} disabled={busy}>Duplicate</button>
              <button class="danger" onclick={() => executeCommand('ticket.deleteSelection')} disabled={busy}>Delete selected</button>
              <button onclick={() => executeCommand('ticket.moveUp')} disabled={busy}>↑ Move</button>
              <button onclick={() => executeCommand('ticket.moveDown')} disabled={busy}>↓ Move</button>
            </div>
            <label for="batch-kind">Operation</label>
            <select id="batch-kind" bind:value={batchKind}>
              <option value="append">Append list item</option>
              <option value="remove">Remove list item</option>
              <option value="replace">Find and replace text</option>
            </select>
            {#if batchKind === 'replace'}
              <label for="batch-text-field">Scope</label>
              <select id="batch-text-field" bind:value={batchTextField}>
                <option value="all">All text (except IDs)</option>
                <option value="task">Task</option>
                <option value="work">Work</option>
                <option value="tests">Tests</option>
                <option value="success_criteria">Success criteria</option>
              </select>
              <input bind:value={findText} placeholder="Find text" aria-label="Find text" />
              <input bind:value={replaceText} placeholder="Replace with" aria-label="Replacement text" />
            {:else}
              <label for="batch-field">Field</label>
              <select id="batch-field" bind:value={batchField}>
                <option value="deps">Dependencies</option>
                <option value="work">Work</option>
                <option value="tests">Tests</option>
                <option value="success_criteria">Success criteria</option>
              </select>
              <input bind:value={batchValue} placeholder="List item text" aria-label="Batch item" />
            {/if}
            <button class="primary" disabled={busy} onclick={() => void applyBatchEdit()}>Apply to selected</button>
          </div>
        {/if}
        <div class="export-controls">
          <label for="export-format">Copy format</label>
          <select id="export-format" bind:value={exportFormat}>
            <option value="compact">Compact JSON (default)</option>
            <option value="pretty">Formatted JSON</option>
            <option value="jsonl">JSONL</option>
          </select>
          <div class="batch-actions">
            <button disabled={!selectedTicketIds.length} onclick={() => executeCommand('ticket.copySelection')}>Copy selected</button>
            <button onclick={() => executeCommand('project.copy')}>Copy project</button>
            <button disabled={!selectedTicketIds.length} onclick={() => executeCommand('ticket.exportSelection')}>Save selected…</button>
            <button onclick={() => executeCommand('project.export')}>Save project…</button>
          </div>
        </div>
        <div class="ticket-list" oncontextmenu={listContextMenu}>
          {#each visibleTickets() as item (item.ticketUuid)}
            <button class:active={item.ticketUuid === ticketUuid} class:selected={selectedTicketIds.includes(item.ticketUuid)} class="ticket-card" onclick={event => selectTicket(event, item)} oncontextmenu={event => ticketContextMenu(event, item)}>
              <span class="ticket-card-top">
                <strong>Ticket {item.number}</strong>
                <span class:warning={!item.validation.valid} class="status-dot" title={item.validation.valid ? 'Valid' : item.validation.errors.join('; ')}></span>
              </span>
              <span class="ticket-task">{typeof item.payload.task === 'string' ? item.payload.task : 'Untitled task'}</span>
              <small>ID: &lt;{item.ticketId}&gt;</small>
            </button>
          {:else}
            <p class="muted">No matching tickets.</p>
          {/each}
        </div>
      {:else}
        <p class="muted">No projects registered.</p>
        <button class="sidebar-button" onclick={() => executeCommand('project.register')}>Register project</button>
      {/if}
    </aside>

    <section class="human-pane">
      <div class="panel-heading">TICKET FIELDS <span>{ticket() ? 'Ticket ' + ticket()?.number : 'Select ticket'}</span></div>
      {#if ticket()}
        <div class="human-body">
          {#if parseError}
            <div class="parse-warning" role="status">JSON has a syntax error. The Ticket Fields form is locked until the JSON is corrected; your last valid fields are preserved.</div>
          {/if}
          <label for="ticket-id">ID</label>
          <input id="ticket-id" disabled={!!parseError} value={textValue('id')} oninput={e => changeText('id', e.currentTarget.value)} />
          <label for="ticket-task">Task</label>
          <textarea id="ticket-task" rows="3" disabled={!!parseError} value={textValue('task')} oninput={e => changeText('task', e.currentTarget.value)}></textarea>
          {#each ['deps', 'work', 'tests', 'success_criteria'] as field (field)}
            {@const fieldView = readTicketField(draft, field)}
            <div class="section-header">
              <h3>{field === 'success_criteria' ? 'Success Criteria' : field === 'deps' ? 'Dependencies' : field === 'work' ? 'Work' : 'Tests'}</h3>
              {#if fieldView.kind === 'scalar'}
                <button disabled={!!parseError} title="Convert this string to an editable list" onclick={() => convertToList(field)}>Convert to list</button>
              {:else if field !== 'deps' && (fieldView.kind === 'list' || fieldView.kind === 'missing')}
                <button disabled={!!parseError} onclick={() => appendItem(field)}>+ Add</button>
              {/if}
            </div>
            {#if field === 'deps' && (fieldView.kind === 'list' || fieldView.kind === 'missing')}
              {#key editorSession}
                <DependencyTags
                  dependencies={fieldView.kind === 'list' ? fieldView.values : []}
                  disabled={!!parseError}
                  onChange={(values) => changeDraft({ ...draft, deps: values })}
                />
              {/key}
            {:else if fieldView.kind === 'scalar'}
              <div class="list-row">
                <textarea rows="2" aria-label={field + ' text'} disabled={!!parseError} value={fieldView.value} oninput={e => changeScalar(field, e.currentTarget.value)}></textarea>
              </div>
            {:else if fieldView.kind === 'list'}
              {#each fieldView.values as item, i (i)}
                <div class="list-row">
                  <span>{i + 1}.</span>
                  <textarea rows="2" aria-label={field + ' item ' + (i + 1)} disabled={!!parseError} value={item} oninput={e => changeItem(field, i, e.currentTarget.value)}></textarea>
                  <button disabled={!!parseError} title="Remove item" aria-label="Remove item" onclick={() => removeItem(field, i)}>×</button>
                </div>
              {/each}
            {:else if fieldView.kind === 'unsupported'}
              <p class="field-warning">{field} contains a non-text JSON value. Edit it in the JSON pane; its original value is preserved.</p>
            {/if}
          {/each}
          {#if !validateTicket(draft).valid}
            <div class="validation-warning">
              <strong>Validation issues</strong>
              {#each validateTicket(draft).errors as issue (issue)}
                <p>{issue}</p>
              {/each}
            </div>
          {/if}
          <p class="muted small">Unknown or nested custom fields remain preserved and can be edited in the JSON pane.</p>
          <div class="editor-controls">
            <button class="primary" disabled={!dirty || !!parseError || busy} onclick={() => executeCommand('ticket.save')}>Save ticket</button>
            <button class="danger" onclick={() => executeCommand('ticket.delete')}>Delete</button>
          </div>
        </div>
      {:else}
        <div class="welcome">
          <h1>TicketsEditor</h1>
          <p>{projectUuid ? 'Create or import tickets to begin editing.' : 'Register a project to begin.'}</p>
          <p>Register a project, import tickets, or add tickets to begin editing.</p>
        </div>
      {/if}
    </section>

    <section class="json-pane">
      <div class="panel-heading">
        JSON EDITOR
        <div class="json-header-actions">
          <span>CodeMirror 6 · JSON</span>
          <button disabled={!ticket() || !!parseError} onclick={() => executeCommand('ticket.format')} title="Format JSON with two-space indentation">Format</button>
        </div>
      </div>
      {#if ticket()}
        {#key editorSession}
          <JsonCodeEditor initialValue={rawJson} onChange={changeJson} theme={appTheme} bind:this={jsonEditor} />
        {/key}
        {#if parseError}<p class="parse-error" role="status">{parseError}</p>{/if}
      {:else}
        <pre class="muted">Select a ticket to view formatted JSON.</pre>
      {/if}
    </section>
  </main>

  {#if commandPaletteOpen}
    <CommandPalette
      commands={buildCommands(
        projectUuid, ticketUuid, dirty, !!parseError, busy,
        selectedTicketIds.length, revisions.length, projects,
      )}
      execute={executePaletteCommand}
      close={closeCommandPalette}
    />
  {/if}

  <footer class="statusbar">
    <span class="status-ready">● SQLite workspace</span>
    <span>{summary.ticketCount} tickets · {summary.projectCount} projects</span>
    {#if projectUuid && linkStatus}
      <button
        class="status-link"
        class:link-error={linkStatus.health === 'broken' || linkStatus.health === 'changed' || linkStatus.health === 'conflict'}
        type="button"
        title={linkStatus.details + ' · Open project settings'}
        onclick={() => openSettings('project')}
      >.tickets: {linkStatus.health}</button>
    {/if}
    {#if dirty}<span class="unsaved">● Unsaved</span>{/if}
    {#if error}<span class="error" title={error}>{error}</span>{/if}
    {#if message}<span class="success">{message}</span>{/if}
    <span class="grow"></span>
    <span>v{version || '0.5.0'}</span>
  </footer>
</div>
