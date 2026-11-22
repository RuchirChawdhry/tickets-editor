<script lang="ts">
  import { onMount } from 'svelte'
  import type { ProjectRecord, TicketObject, TicketRecord, WorkspaceSummary } from '../../shared/contracts'
  import { validateTicket } from '../../shared/ticket-validation'

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
  let search = ''
  let draft: TicketObject = {}
  let rawJson = ''
  let parseError = ''
  let error = ''
  let message = ''
  let dirty = false
  let busy = false

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
    draft = next
    rawJson = JSON.stringify(next, null, 2)
    parseError = ''
    dirty = true
    message = ''
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
    try {
      const result: unknown = JSON.parse(value)
      if (result === null || typeof result !== 'object' || Array.isArray(result)) {
        parseError = 'Ticket must be a JSON object'
      } else {
        draft = result as TicketObject
        parseError = ''
      }
    } catch (cause) {
      parseError = cause instanceof Error ? cause.message : String(cause)
    }
  }

  function openTicket(item: TicketRecord): void {
    if (dirty && !window.confirm('Discard unsaved changes to this ticket?')) return
    ticketUuid = item.ticketUuid
    draft = structuredClone(item.payload)
    rawJson = JSON.stringify(draft, null, 2)
    parseError = ''
    dirty = false
    message = ''
  }

  function clearTicket(): void {
    ticketUuid = ''
    draft = {}
    rawJson = ''
    dirty = false
    parseError = ''
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
      clearTicket()
      return
    }
    tickets = await window.ticketsEditor.listTickets(projectUuid)
    const next = tickets.find(item => item.ticketUuid === preferredTicketUuid) ??
      tickets.find(item => item.ticketUuid === ticketUuid) ?? tickets[0]
    clearTicket()
    if (next) openTicket(next)
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
      const saved = await window.ticketsEditor.updateTicket(projectUuid, ticketUuid, draft)
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

  function onHotkey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveTicket()
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      document.getElementById('ticket-search')?.focus()
    }
  }
</script>

<svelte:window onkeydown={onHotkey} />

<div class="app">
  <header class="titlebar">
    <div class="brand"><span class="brand-icon">T</span>TicketsEditor</div>
    <div class="tabs">
      {#each projects as p (p.projectUuid)}
        <button class:active={p.projectUuid === projectUuid} class="tab" title={p.rootPath} onclick={() => void selectProject(p.projectUuid)}>▣ {p.name}</button>
      {/each}
      <button class="title-action" title="Register project" onclick={addProjectForm}>+</button>
    </div>
    <div class="drag-space"></div>
    <div class="title-actions">
      <button class="title-action" title="Search (Ctrl+K)" onclick={() => document.getElementById('ticket-search')?.focus()}>⌕</button>
      <button class="title-action" title="Save (Ctrl+S)" disabled={!dirty || !!parseError || busy} onclick={() => void saveTicket()}>▣</button>
      <button class="title-action" title="Import JSON/JSONL" disabled={!projectUuid || busy} onclick={() => void importTickets()}>⇩</button>
      <button class="title-action" title="New ticket" disabled={!projectUuid || busy} onclick={() => void createTicket()}>+</button>
    </div>
    <div class="caption-reserved"></div>
  </header>

  <div class="subbar">
    <strong>{project()?.name ?? 'Workspace'}</strong>
    <span class="path-label">{project()?.rootPath ?? 'Register a project to begin'}</span>
    <span class="grow"></span>
    <button disabled={!projectUuid} onclick={editProjectForm}>Project settings</button>
    <button disabled={!projectUuid} onclick={() => void unregisterProject()}>Unregister</button>
  </div>

  {#if projectFormOpen}
    <div class="dialog-shade">
      <section class="project-dialog" role="dialog" aria-modal="true" aria-label="Configure project">
        <h2>{editProjectUuid ? 'Edit project' : 'Register project'}</h2>
        <p>Choose the full path to an existing project directory.</p>
        <label for="project-name">Project name</label>
        <input id="project-name" bind:value={projectName} placeholder="DLL Viewer" />
        <label for="project-path">Absolute project directory</label>
        <div class="path-input">
          <input id="project-path" bind:value={projectPath} placeholder="C:\Projects\DLLViewer" />
          <button onclick={() => void pickDirectory()}>Browse…</button>
        </div>
        <div class="dialog-actions">
          <button onclick={() => { projectFormOpen = false }}>Cancel</button>
          <button class="primary" disabled={busy || !projectName.trim() || !projectPath.trim()} onclick={() => void saveProject()}>
            {editProjectUuid ? 'Save changes' : 'Register project'}
          </button>
        </div>
      </section>
    </div>
  {/if}

  <main class="workspace">
    <aside class="navigator">
      <div class="panel-heading">TICKETS <span>{tickets.length}</span></div>
      {#if projectUuid}
        <input class="search" id="ticket-search" bind:value={search} placeholder="Search tickets…" aria-label="Search tickets" />
        <div class="navigator-controls">
          <button onclick={() => void createTicket()} disabled={busy}>+ New</button>
          <button onclick={() => void importTickets()} disabled={busy}>Import JSON/JSONL</button>
        </div>
        <div class="ticket-list">
          {#each visibleTickets() as item (item.ticketUuid)}
            <button class:active={item.ticketUuid === ticketUuid} class="ticket-card" onclick={() => openTicket(item)}>
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
        <button class="sidebar-button" onclick={addProjectForm}>Register project</button>
      {/if}
    </aside>

    <section class="human-pane">
      <div class="panel-heading">HUMANIZED EDITOR <span>{ticket() ? 'Ticket ' + ticket()?.number : 'Select ticket'}</span></div>
      {#if ticket()}
        <div class="human-body">
          <label for="ticket-id">ID</label>
          <input id="ticket-id" value={textValue('id')} oninput={e => changeText('id', e.currentTarget.value)} />
          <label for="ticket-task">Task</label>
          <textarea id="ticket-task" rows="3" value={textValue('task')} oninput={e => changeText('task', e.currentTarget.value)}></textarea>
          {#each ['deps', 'work', 'tests', 'success_criteria'] as field (field)}
            <div class="section-header">
              <h3>{field === 'success_criteria' ? 'Success Criteria (required)' : field === 'deps' ? 'Dependencies' : field === 'work' ? 'Work' : 'Tests'}</h3>
              <button onclick={() => appendItem(field)}>+ Add</button>
            </div>
            {#each listValue(field) as item, i (i)}
              <div class="list-row">
                <span>{i + 1}.</span>
                <textarea rows="2" value={item} oninput={e => changeItem(field, i, e.currentTarget.value)}></textarea>
                <button title="Remove item" aria-label="Remove item" onclick={() => removeItem(field, i)}>×</button>
              </div>
            {/each}
          {/each}
          {#if !validateTicket(draft).valid}
            <div class="validation-warning">
              <strong>Validation issues</strong>
              {#each validateTicket(draft).errors as issue}
                <p>{issue}</p>
              {/each}
            </div>
          {/if}
          <p class="muted small">Unknown or nested custom fields remain preserved and can be edited in the JSON pane.</p>
          <div class="editor-controls">
            <button class="primary" disabled={!dirty || !!parseError || busy} onclick={() => void saveTicket()}>Save ticket</button>
            <button class="danger" onclick={() => void deleteTicket()}>Delete</button>
          </div>
        </div>
      {:else}
        <div class="welcome">
          <h1>TicketsEditor</h1>
          <p>{projectUuid ? 'Create or import tickets to begin editing.' : 'Register a project to begin.'}</p>
          <p>AppData .tickets hardlink setup is the next milestone.</p>
        </div>
      {/if}
    </section>

    <section class="json-pane">
      <div class="panel-heading">JSON EDITOR <span>Pretty-printed · 2 spaces</span></div>
      {#if ticket()}
        <textarea class="json-code" spellcheck="false" aria-label="JSON editor" value={rawJson} oninput={e => changeJson(e.currentTarget.value)}></textarea>
        {#if parseError}<p class="parse-error">{parseError}</p>{/if}
      {:else}
        <pre class="muted">Select a ticket to view formatted JSON.</pre>
      {/if}
    </section>
  </main>

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
