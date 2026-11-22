<script lang="ts">
  import { onMount } from 'svelte';
  import CommandIcon from './CommandIcon.svelte';
  import type { Command, StaticCommandId } from './commands';
  import { customizableCommands, isPinnableCommandId } from './titlebar-pins';

  export let commands: Command[];
  export let pinned: StaticCommandId[];
  export let pin: (id: StaticCommandId) => void;
  export let unpin: (id: StaticCommandId) => void;
  export let move: (id: StaticCommandId, direction: -1 | 1) => void;
  export let reset: () => void;
  export let close: () => void;

  let query = '';
  let filterInput: HTMLInputElement;

  onMount(() => {
    filterInput?.focus();
  });

  function asPinId(command: Command): StaticCommandId | undefined {
    return isPinnableCommandId(command.id) ? command.id : undefined;
  }

  function togglePin(command: Command): void {
    const id = asPinId(command);
    if (!id) return;
    if (pinned.includes(id)) unpin(id);
    else pin(id);
  }
</script>

<div
  class="titlebar-customizer"
  role="dialog"
  aria-label="Customize title-bar commands"
>
  <div class="titlebar-customizer-header">
    <div>
      <strong>Customize title bar</strong>
      <small>Pin commands for quick access</small>
    </div>
    <button
      class="titlebar-customize-close"
      type="button"
      title="Close"
      aria-label="Close title-bar customization"
      onclick={close}
    >×</button>
  </div>
  <input
    bind:this={filterInput}
    bind:value={query}
    class="titlebar-customize-search"
    placeholder="Find a command…"
    aria-label="Filter commands"
  />
  <div class="titlebar-customize-list">
    {#each customizableCommands(commands, pinned, query) as command (command.id)}
      <div class="titlebar-customize-item">
        <span class="titlebar-customize-symbol" aria-hidden="true"><CommandIcon id={command.id} fallback={command.icon} /></span>
        <span class="titlebar-customize-text">
          <strong>{command.title}</strong>
          <small>{command.description}</small>
        </span>
        {#if asPinId(command) && pinned.includes(command.id as StaticCommandId)}
          <div class="titlebar-customize-actions">
            <button
              type="button"
              aria-label={'Move ' + command.title + ' left'}
              title="Move left"
              disabled={pinned.indexOf(command.id as StaticCommandId) === 0}
              onclick={() => move(command.id as StaticCommandId, -1)}
            >←</button>
            <button
              type="button"
              aria-label={'Move ' + command.title + ' right'}
              title="Move right"
              disabled={pinned.indexOf(command.id as StaticCommandId) === pinned.length - 1}
              onclick={() => move(command.id as StaticCommandId, 1)}
            >→</button>
            <button
              type="button"
              class="titlebar-pin-toggle"
              aria-label={'Unpin ' + command.title}
              onclick={() => togglePin(command)}
            >Unpin</button>
          </div>
        {:else}
          <button
            type="button"
            class="titlebar-pin-toggle"
            aria-label={'Pin ' + command.title}
            onclick={() => togglePin(command)}
          >Pin</button>
        {/if}
      </div>
    {:else}
      <p class="titlebar-customize-empty">No matching commands.</p>
    {/each}
  </div>
  <div class="titlebar-customizer-footer">
    <span>{pinned.length} pinned · Drag icons to reorder</span>
    <button type="button" onclick={reset}>Restore defaults</button>
  </div>
</div>
