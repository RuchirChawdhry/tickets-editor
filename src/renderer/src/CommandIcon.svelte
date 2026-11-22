<script lang="ts">
  /** The three distinct actions that previously shared a plus glyph. */
  export let id: string;
  export let fallback = '';
</script>

{#if id === 'project.register'}
  <svg class="command-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 12V5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v5" />
    <path d="M3 8v11a2 2 0 0 0 2 2h8" />
    <path d="M16 18h6M19 15v6" />
  </svg>
{:else if id === 'ticket.new'}
  <svg class="command-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6" />
    <path d="M12 2l6 6h-6V2M18 8v4" />
    <path d="M15 18h7M18.5 14.5v7" />
  </svg>
{:else if id === 'titlebar.customize'}
  <svg class="command-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7h8m5 0h3M4 17h3m5 0h8" />
    <circle cx="14.5" cy="7" r="2.5" />
    <circle cx="9.5" cy="17" r="2.5" />
  </svg>
{:else}
  {fallback}
{/if}
