<script lang="ts">
  import { onMount } from 'svelte';
  import {
    formatShortcut,
    nextEnabledIndex,
    searchCommands,
  } from './commands';
  import type { Command, CommandId } from './commands';

  export let commands: Command[];
  export let execute: (id: CommandId) => void;
  export let close: () => void;

  let dialog: HTMLDialogElement;
  let searchInput: HTMLInputElement;
  let query = '';
  let selectedIndex = 0;
  let didExecute = false;

  $: matches = searchCommands(commands, query);

  onMount(() => {
    const previousFocus = document.activeElement;
    dialog.showModal();
    searchInput.focus();

    return () => {
      if (dialog.open) dialog.close();
      if (!didExecute && previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  });

  function selectCommand(command: Command): void {
    if (!command.enabled) return;
    didExecute = true;
    execute(command.id);
  }

  function onQuery(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    const results = searchCommands(commands, query);
    selectedIndex = results.findIndex((command) => command.enabled);
  }

  function onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      selectedIndex = nextEnabledIndex(matches, selectedIndex, direction);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const command = matches[selectedIndex];
      if (command?.enabled) selectCommand(command);
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="command-palette"
  aria-label="Command palette"
  onclose={close}
>
  <div class="palette-search">
    <span aria-hidden="true">⌕</span>
    <input
      bind:this={searchInput}
      value={query}
      oninput={onQuery}
      onkeydown={onSearchKeydown}
      type="search"
      placeholder="Type a command…"
      aria-label="Search application commands"
      autocomplete="off"
      spellcheck="false"
    />
    <kbd>Esc</kbd>
  </div>
  <div class="palette-results" role="listbox" aria-label="Available commands">
    {#each matches as command, index (command.id)}
      <button
        type="button"
        role="option"
        aria-selected={index === selectedIndex && command.enabled}
        class="palette-result"
        class:active={index === selectedIndex && command.enabled}
        disabled={!command.enabled}
        title={command.description}
        onclick={() => selectCommand(command)}
        onmouseenter={() => { if (command.enabled) selectedIndex = index; }}
      >
        <span class="palette-command-text">
          <span class="palette-command-title">{command.title}</span>
          <span class="palette-command-description">{command.description}</span>
        </span>
        <span class="palette-command-meta">
          <span>{command.group}</span>
          {#if command.shortcut}<kbd>{formatShortcut(command.shortcut)}</kbd>{/if}
          {#if !command.enabled}<span>Unavailable</span>{/if}
        </span>
      </button>
    {:else}
      <p class="palette-empty">No matching commands.</p>
    {/each}
  </div>
  <div class="palette-footer">
    <span>↑ ↓ Navigate</span>
    <span>Enter Run</span>
    <span>Esc Close</span>
  </div>
</dialog>
