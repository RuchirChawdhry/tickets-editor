<script lang="ts">
  import { onMount, tick } from 'svelte'
  import type { ContextMenuEntry } from '../../shared/context-menu'
  import {
    contextEntryIcon, contextEntryLabel, contextGlyphPaths,
    destructiveContextEntry, firstContextMenuIndex, fitContextMenu,
    nextContextMenuIndex
  } from '../../shared/context-menu-view'

  export let items: ContextMenuEntry[]
  export let x: number
  export let y: number
  export let onSelect: (entry: ContextMenuEntry) => void
  export let onClose: () => void

  let menuRoot: HTMLDivElement
  let left = 0
  let top = 0
  let positioned = false
  let activeIndex = -1

  function focusItem(index: number): void {
    if (index < 0) return
    const item = menuRoot.querySelector<HTMLButtonElement>(`[data-menu-index="${index}"]`)
    if (!item) return
    activeIndex = index
    item.focus({ preventScroll: true })
  }

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        onClose()
        break
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const next = nextContextMenuIndex(items, activeIndex,
          event.key === 'ArrowDown' ? 1 : -1)
        focusItem(next)
        break
      }
      case 'Home':
      case 'End': {
        event.preventDefault()
        const index = event.key === 'Home'
          ? firstContextMenuIndex(items)
          : nextContextMenuIndex(items, 0, -1)
        focusItem(index)
        break
      }
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const item = items[activeIndex]
        if (item && item.kind !== 'separator' && item.enabled !== false) onSelect(item)
        break
      }
      case 'Tab':
        // Exit without trapping focus.
        onClose()
        break
    }
  }

  function onOutsidePointer(event: PointerEvent): void {
    if (menuRoot && event.target instanceof Node && !menuRoot.contains(event.target)) {
      onClose()
    }
  }

  function dismissOnScroll(event: Event): void {
    if (!menuRoot || !event.target || !menuRoot.contains(event.target as Node)) onClose()
  }

  onMount(() => {
    window.addEventListener('scroll', dismissOnScroll, true)
    void (async () => {
      await tick()
      if (!menuRoot) return
      const rect = menuRoot.getBoundingClientRect()
      const fitted = fitContextMenu(
        x, y, window.innerWidth, window.innerHeight, rect.width, rect.height
      )
      left = fitted.left
      top = fitted.top
      positioned = true
      await tick()
      const first = firstContextMenuIndex(items)
      if (first < 0) menuRoot.focus({ preventScroll: true })
      else focusItem(first)
    })()
    return () => window.removeEventListener('scroll', dismissOnScroll, true)
  })
</script>

<svelte:window
  onpointerdown={onOutsidePointer}
  onblur={onClose}
/>

<div
  bind:this={menuRoot}
  class="app-context-menu"
  role="menu"
  tabindex="-1"
  aria-label="Context actions"
  style:left={left + 'px'}
  style:top={top + 'px'}
  style:visibility={positioned ? 'visible' : 'hidden'}
  onkeydown={onKeydown}
>
  {#each items as item, index (index)}
    {#if item.kind === 'separator'}
      <div class="app-context-divider" role="separator"></div>
    {:else}
      {@const icon = contextEntryIcon(item)}
      <button
        type="button"
        role="menuitem"
        class="app-context-item"
        class:destructive={destructiveContextEntry(item)}
        data-menu-index={index}
        tabindex={activeIndex === index ? 0 : -1}
        disabled={item.enabled === false}
        aria-label={contextEntryLabel(item)}
        onmouseenter={() => { if (item.enabled !== false) focusItem(index) }}
        onclick={() => onSelect(item)}
      >
        <span class="app-context-icon" aria-hidden="true">
          {#if icon}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d={contextGlyphPaths[icon]}></path>
            </svg>
          {/if}
        </span>
        <span class="app-context-label">{contextEntryLabel(item)}</span>
      </button>
    {/if}
  {/each}
</div>
