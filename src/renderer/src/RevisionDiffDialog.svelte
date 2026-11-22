<script lang="ts">
  import { onMount, tick } from 'svelte'
  import './revision-diff.css'
  import type { RevisionRecord, RevisionReference } from '../../shared/contracts'
  import {
    buildRevisionDiff, visibleDiffRows
  } from '../../shared/revision-diff'
  import type { RevisionDiff, VisibleDiffRow } from '../../shared/revision-diff'

  export let projectUuid: string
  export let projectName: string
  export let revisions: RevisionRecord[]
  export let initialRevisionId: number
  export let close: () => void

  let beforeReference: number = initialRevisionId
  let afterReference: RevisionReference = 'current'
  let comparison: RevisionDiff | null = null
  let loading = false
  let error = ''
  let showAllLines = false
  let activeHunk = 0

  function label(reference: RevisionReference): string {
    if (reference === 'current') return 'Current SQLite document'
    const revision = revisions.find(row => row.revisionId === reference)
    return 'Revision #' + reference + (revision ? ' · ' + revision.createdAt : '')
  }

  function shownRows(): VisibleDiffRow[] {
    if (!comparison) return []
    return showAllLines
      ? comparison.rows.map((row, index) => ({ kind: 'row' as const, index, row }))
      : visibleDiffRows(comparison)
  }

  async function showHunk(index: number): Promise<void> {
    if (!comparison || index < 0 || index >= comparison.hunks.length) return
    activeHunk = index
    await tick()
    document.getElementById('revision-diff-row-' + comparison.hunks[index])
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  async function compare(): Promise<void> {
    loading = true
    error = ''
    comparison = null
    try {
      const [before, after] = await Promise.all([
        window.ticketsEditor.getRevisionSnapshot(projectUuid, beforeReference),
        window.ticketsEditor.getRevisionSnapshot(projectUuid, afterReference)
      ])
      comparison = buildRevisionDiff(before.json, after.json)
      activeHunk = 0
      loading = false
      if (comparison.hunks.length) await showHunk(0)
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause)
      loading = false
    }
  }

  onMount(() => {
    void compare()
  })
</script>

<svelte:window onkeydown={event => { if (event.key === 'Escape') close() }} />

<div class="revision-diff-overlay">
  <dialog open class="revision-diff-dialog" aria-label="Visual revision diff">
    <header class="revision-diff-header">
      <div>
        <h2>Compare revisions</h2>
        <p>{projectName} · Read-only JSON comparison</p>
      </div>
      <button class="revision-close" aria-label="Close revision comparison" title="Close" onclick={close}>×</button>
    </header>

    <div class="revision-diff-toolbar">
      <div class="revision-diff-selector">
        <label for="diff-before">Before</label>
        <select id="diff-before" bind:value={beforeReference} onchange={() => void compare()}>
          {#each revisions as revision (revision.revisionId)}
            <option value={revision.revisionId}>Revision #{revision.revisionId} · {revision.createdAt}</option>
          {/each}
        </select>
      </div>
      <span class="revision-arrow" aria-hidden="true">→</span>
      <div class="revision-diff-selector">
        <label for="diff-after">After</label>
        <select id="diff-after" bind:value={afterReference} onchange={() => void compare()}>
          <option value="current">Current SQLite document</option>
          {#each revisions as revision (revision.revisionId)}
            <option value={revision.revisionId}>Revision #{revision.revisionId} · {revision.createdAt}</option>
          {/each}
        </select>
      </div>
    </div>

    {#if comparison}
      <div class="revision-diff-summary">
        <span class="revision-stat added">+{comparison.added} added</span>
        <span class="revision-stat removed">−{comparison.removed} removed</span>
        <span class="revision-stat changed">~{comparison.changed} changed</span>
        <span class="revision-stat neutral">{comparison.hunks.length} change groups</span>
        <div class="revision-grow"></div>
        <label class="revision-showall">
          <input type="checkbox" bind:checked={showAllLines} />
          Show unchanged lines
        </label>
        <button disabled={!comparison.hunks.length || activeHunk === 0}
          onclick={() => void showHunk(activeHunk - 1)}>↑ Previous</button>
        <span class="revision-position">
          {comparison.hunks.length ? activeHunk + 1 : 0} / {comparison.hunks.length}
        </span>
        <button disabled={!comparison.hunks.length || activeHunk >= comparison.hunks.length - 1}
          onclick={() => void showHunk(activeHunk + 1)}>Next ↓</button>
      </div>
      <div class="revision-diff-headings">
        <span>{label(beforeReference)}</span>
        <span>{label(afterReference)}</span>
      </div>
      <div class="revision-diff-scroll" role="region" aria-label="Side-by-side JSON changes">
        {#if comparison.hunks.length === 0}
          <p class="revision-diff-empty">These revisions contain identical JSON.</p>
        {:else}
          {#each shownRows() as item (item.index + '-' + item.kind)}
            {#if item.kind === 'gap'}
              <div class="revision-diff-gap">
                <span>{item.count} unchanged lines hidden</span>
              </div>
            {:else}
              <div class="revision-diff-row" id={'revision-diff-row-' + item.index}
                class:revision-diff-changed={item.row.kind === 'changed'}
                class:revision-diff-added={item.row.kind === 'added'}
                class:revision-diff-removed={item.row.kind === 'removed'}>
                <div class="revision-diff-cell revision-diff-before">
                  <span class="revision-line-number">{item.row.before?.number ?? ''}</span>
                  <code>{item.row.before?.text ?? ''}</code>
                </div>
                <div class="revision-diff-cell revision-diff-after">
                  <span class="revision-line-number">{item.row.after?.number ?? ''}</span>
                  <code>{item.row.after?.text ?? ''}</code>
                </div>
              </div>
            {/if}
          {/each}
        {/if}
      </div>
    {:else if loading}
      <p class="revision-diff-empty">Comparing JSON snapshots…</p>
    {:else if error}
      <p class="revision-diff-error" role="alert">{error}</p>
    {/if}
    <footer class="revision-diff-footer">
      <span>Comparison only · No tickets, revisions, or project files are changed</span>
      <button onclick={close}>Close</button>
    </footer>
  </dialog>
</div>
