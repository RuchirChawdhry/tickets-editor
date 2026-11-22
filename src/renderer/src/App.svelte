<script lang="ts">
  import { onMount } from 'svelte'
  import type { WorkspaceSummary } from '../../shared/contracts'

  let summary: WorkspaceSummary = { projectCount: 0, ticketCount: 0 }
  let version = ''
  let startupError = ''

  onMount(() => {
    void Promise.all([window.ticketsEditor.getSummary(), window.ticketsEditor.getVersion()])
      .then(([stats, appVersion]) => {
        summary = stats
        version = appVersion
      })
      .catch(error => {
        startupError = String(error)
      })
  })
</script>

<div class="app">
  <header class="titlebar">
    <div class="brand"><span class="brand-icon">T</span><span>TicketsEditor</span></div>
    <div class="tab active"><span class="tab-glyph">▣</span>Workspace</div>
    <div class="titlebar-drag"></div>
    <div class="caption-reserved" aria-hidden="true"></div>
  </header>

  <div class="subbar">
    <span>Workspace</span>
    <span class="subbar-detail">Multi-project ticket library</span>
  </div>

  <main class="workspace">
    <aside class="navigator">
      <div class="panel-header">PROJECTS <span>{summary.projectCount}</span></div>
      <div class="sidebar-empty">No projects registered</div>
      <div class="sidebar-footer">Project paths and hardlink setup will appear here.</div>
    </aside>
    <section class="human-pane">
      <div class="panel-header">HUMAN VIEW <span>Ticket editor</span></div>
      <div class="empty-state">
        <div class="empty-icon">▤</div>
        <h1>TicketsEditor</h1>
        <p>Your centralized workspace for correcting agent-generated tickets.</p>
        <p class="hint">Project registration and multi-ticket editing are the next implementation steps.</p>
      </div>
    </section>
    <section class="json-pane">
      <div class="panel-header">JSON EDITOR <span>Pretty-printed</span></div>
      <div class="json-placeholder">{'{'}</div>
      <div class="json-placeholder indent">"tickets": []</div>
      <div class="json-placeholder">{'}'}</div>
      <p class="json-hint">Compact JSON is the default export format.</p>
    </section>
  </main>

  <footer class="statusbar">
    <span class="status-ready">● SQLite workspace</span>
    <span>{summary.ticketCount} tickets · {summary.projectCount} projects</span>
    <span class="status-spacer"></span>
    {#if startupError}<span class="status-error">{startupError}</span>{/if}
    <span>v{version || '0.1.0'}</span>
  </footer>
</div>
