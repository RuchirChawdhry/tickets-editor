<script lang="ts">
  import { onMount } from 'svelte'
  import JsonCodeEditor from './JsonCodeEditor.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import { commandForShortcut, createCommands, runCommand } from './commands'
  import type { CommandId, CommandHandlers } from './commands'
  import { parseTicketDraft } from '../../shared/ticket-diagnostics'
  import RevisionDiffDialog from './RevisionDiffDialog.svelte'
  import type { LinkMode, ProjectLinkStatus, ProjectRecord, RevisionRecord, TicketObject, TicketRecord, WorkspaceSummary } from '../../shared/contracts'
  import { validateTicket } from '../../shared/ticket-validation'
  import type { BatchOperation, BatchArrayField, BatchTextField } from '../../shared/batch-operations'

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
  let commandPaletteOpen = false
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

  function listValue(key: string): string[] {
    return Array.isArray(draft[key]) ? (draft[key] as unknown[]).map(String) : []
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

  function changeItem(key: string, index: number, value: string): void {
    const values = listValue(key)
    values[index] = value
    changeDraft({ ...draft, [key]: values })
  }

  function appendItem(key: string): void {
    changeDraft({ ...draft, [key]: [...listValue(key), ''] })
  }

  function removeItem(key: string, index: number): void {
    changeDraft({ ...draft, [key]: listValue(key).filter((_, i) => i !== index) })
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

  async function selectProject(id: string): Promise<void> {
    if (id === projectUuid) return
    if (dirty && !window.confirm('Discard unsaved changes to this ticket?')) return
    projectUuid = id
    clearTicket()
    try {
      error = ''
      await reload()
    } catch (cause) {
      showError(cause)
    }
  }

  onMount(() => {
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
    return unsubscribe
  })

  function addProjectForm(): void {
    editProjectUuid = ''
    projectName = ''
    projectPath = ''
    projectFormOpen = true
  }

  function editProjectForm(): void {
    const current = project()
    if (!current) return
    editProjectUuid = current.projectUuid
    projectName = current.name
    projectPath = current.rootPath
    projectFormOpen = true
    void loadRevisions()
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
      projectFormOpen = false
      await reload()
      message = 'Project registered in SQLite'
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

  async function unregisterProject(): Promise<void> {
    const current = project()
    if (!current || !window.confirm('Unregister ' + current.name + '? Project files will not be deleted.')) return
    try {
      await window.ticketsEditor.removeProject(current.projectUuid)
      projectUuid = ''
      clearTicket()
      projects = await window.ticketsEditor.listProjects()
      projectUuid = projects[0]?.projectUuid ?? ''
      await reload()
      message = 'Project unregistered'
    } catch (cause) {
      showError(cause)
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
    if (projectFormOpen || diffOpen) return
    commandPaletteOpen = true
  }

  function closeCommandPalette(): void {
    commandPaletteOpen = false
  }

  function clearSelection(): void {
    selectedTicketIds = []
    selectionAnchor = ''
  }

  const handlers: CommandHandlers = {
    'palette.open': openCommandPalette,
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

  $: commands = createCommands({
    hasProject: !!projectUuid,
    hasTicket: !!ticketUuid,
    dirty,
    invalidJson: !!parseError,
    busy,
    selectionCount: selectedTicketIds.length,
    revisionCount: revisions.length,
  }, handlers, projects, (id) => { void selectProject(id) })

  function executeCommand(id: CommandId): void {
    runCommand(commands, id)
  }

  function executePaletteCommand(id: CommandId): void {
    closeCommandPalette()
    executeCommand(id)
  }

  function onHotkey(event: KeyboardEvent): void {
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

    const match = commandForShortcut(commands, event)
    if (!match) return
    event.preventDefault()
    executeCommand(match.id)
  }

</script>

<svelte:window onkeydown={onHotkey} />

<div class="app">
  <header class="titlebar">
    <div class="brand"><span class="brand-icon">T</span>TicketsEditor</div>
    <div class="tabs">
      {#each projects as p (p.projectUuid)}
        <button class:active={p.projectUuid === projectUuid} class="tab" title={p.rootPath} onclick={() => executeCommand(`project.switch:${p.projectUuid}`)}>▣ {p.name}</button>
      {/each}
      <button class="title-action" title="Register project" onclick={() => executeCommand('project.register')}>+</button>
    </div>
    <div class="drag-space"></div>
    <div class="title-actions">
      <button class="title-action" title="Search tickets (Ctrl/⌘+K)" onclick={() => executeCommand('project.search')}>⌕</button>
      <button class="title-action" title="Commands (Ctrl/⌘+Shift+P)" aria-label="Open command palette" onclick={() => executeCommand('palette.open')}>≡</button>
      <button class="title-action" title="Save (Ctrl/⌘+S)" disabled={!dirty || !!parseError || busy} onclick={() => executeCommand('ticket.save')}>▣</button>
      <button class="title-action" title="Import JSON/JSONL" disabled={!projectUuid || busy} onclick={() => executeCommand('project.import')}>⇩</button>
      <button class="title-action" title="New ticket" disabled={!projectUuid || busy} onclick={() => executeCommand('ticket.new')}>+</button>
    </div>
    <div class="caption-reserved"></div>
  </header>

  <div class="subbar">
    <strong>{project()?.name ?? 'Workspace'}</strong>
    <span class="path-label">{project()?.rootPath ?? 'Register a project to begin'}</span>
    <span class="grow"></span>
    {#if linkStatus}
      <span class:link-error={linkStatus.health === 'broken' || linkStatus.health === 'changed'} class="link-health" title={linkStatus.details}>
        .tickets: {linkStatus.health}{linkStatus.mode ? ' (' + linkStatus.mode + ')' : ''}
      </span>
    {/if}
    {#if linkStatus?.health === 'changed'}
      <button onclick={() => void importExternalChanges()}>Import external changes</button>
    {/if}
    {#if linkStatus?.health === 'conflict'}
      <button onclick={() => void recoverFromSqlite()}>Resolve from SQLite</button>
    {/if}
    <button disabled={!projectUuid} onclick={() => executeCommand('project.settings')}>Project settings</button>
    <button disabled={!projectUuid} onclick={() => void unregisterProject()}>Unregister</button>
  </div>

  {#if projectFormOpen}
    <div class="dialog-shade">
      <dialog class="project-dialog" open aria-label="Configure project">
        <h2>{editProjectUuid ? 'Edit project' : 'Register project'}</h2>
        <p>Choose the full path to an existing project directory.</p>
        <label for="project-name">Project name</label>
        <input id="project-name" bind:value={projectName} placeholder="DLL Viewer" />
        <label for="project-path">Absolute project directory</label>
        <div class="path-input">
          <input id="project-path" bind:value={projectPath} placeholder="C:\Projects\DLLViewer" />
          <button onclick={() => void pickDirectory()}>Browse…</button>
        </div>
        {#if editProjectUuid && linkStatus}
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
        <div class="dialog-actions">
          <button onclick={() => { projectFormOpen = false }}>Cancel</button>
          <button class="primary" disabled={busy || !projectName.trim() || !projectPath.trim()} onclick={() => void saveProject()}>
            {editProjectUuid ? 'Save changes' : 'Register project'}
          </button>
        </div>
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
        <div class="ticket-list">
          {#each visibleTickets() as item (item.ticketUuid)}
            <button class:active={item.ticketUuid === ticketUuid} class:selected={selectedTicketIds.includes(item.ticketUuid)} class="ticket-card" onclick={event => selectTicket(event, item)}>
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
      <div class="panel-heading">HUMANIZED EDITOR <span>{ticket() ? 'Ticket ' + ticket()?.number : 'Select ticket'}</span></div>
      {#if ticket()}
        <div class="human-body">
          {#if parseError}
            <div class="parse-warning" role="status">JSON has a syntax error. The humanized form is locked until the JSON is corrected; your last valid fields are preserved.</div>
          {/if}
          <label for="ticket-id">ID</label>
          <input id="ticket-id" disabled={!!parseError} value={textValue('id')} oninput={e => changeText('id', e.currentTarget.value)} />
          <label for="ticket-task">Task</label>
          <textarea id="ticket-task" rows="3" disabled={!!parseError} value={textValue('task')} oninput={e => changeText('task', e.currentTarget.value)}></textarea>
          {#each ['deps', 'work', 'tests', 'success_criteria'] as field (field)}
            <div class="section-header">
              <h3>{field === 'success_criteria' ? 'Success Criteria (required)' : field === 'deps' ? 'Dependencies' : field === 'work' ? 'Work' : 'Tests'}</h3>
              <button disabled={!!parseError} onclick={() => appendItem(field)}>+ Add</button>
            </div>
            {#each listValue(field) as item, i (i)}
              <div class="list-row">
                <span>{i + 1}.</span>
                <textarea rows="2" disabled={!!parseError} value={item} oninput={e => changeItem(field, i, e.currentTarget.value)}></textarea>
                <button disabled={!!parseError} title="Remove item" aria-label="Remove item" onclick={() => removeItem(field, i)}>×</button>
              </div>
            {/each}
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
          <JsonCodeEditor initialValue={rawJson} onChange={changeJson} bind:this={jsonEditor} />
        {/key}
        {#if parseError}<p class="parse-error" role="status">{parseError}</p>{/if}
      {:else}
        <pre class="muted">Select a ticket to view formatted JSON.</pre>
      {/if}
    </section>
  </main>

  {#if commandPaletteOpen}
    <CommandPalette
      {commands}
      execute={executePaletteCommand}
      close={closeCommandPalette}
    />
  {/if}

  <footer class="statusbar">
    <span class="status-ready">● SQLite workspace</span>
    <span>{summary.ticketCount} tickets · {summary.projectCount} projects</span>
    {#if dirty}<span class="unsaved">● Unsaved</span>{/if}
    {#if error}<span class="error" title={error}>{error}</span>{/if}
    {#if message}<span class="success">{message}</span>{/if}
    <span class="grow"></span>
    <span>v{version || '0.1.0'}</span>
  </footer>
</div>
