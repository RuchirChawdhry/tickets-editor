<script lang="ts">
  import {
    mergeDependencyTags, removeDependencyTag, tokenizeDependencies
  } from '../../shared/dependency-tags'

  export let dependencies: string[]
  export let disabled = false
  export let onChange: (values: string[]) => void

  let pending = ''
  let inputElement: HTMLInputElement
  let composing = false

  function consumeInput(value: string, flush = false): void {
    const result = tokenizeDependencies(value, flush)
    pending = result.pending
    if (!result.tokens.length) return

    const next = mergeDependencyTags(dependencies, result.tokens)
    if (next.length !== dependencies.length) onChange(next)
  }

  function onInput(event: Event): void {
    pending = (event.currentTarget as HTMLInputElement).value
    if (!composing) consumeInput(pending)
  }

  function onKeydown(event: KeyboardEvent): void {
    if (composing || event.isComposing) return

    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      consumeInput(pending, true)
    } else if (event.key === 'Backspace' && !pending && dependencies.length) {
      event.preventDefault()
      onChange(removeDependencyTag(dependencies, dependencies.length - 1))
    }
  }

  function removeAt(index: number): void {
    onChange(removeDependencyTag(dependencies, index))
    if (!disabled) inputElement?.focus()
  }
</script>

<div class="dependency-entry" role="group" aria-label="Dependencies">
  {#each dependencies as dependency, index (index)}
    <span class="dependency-chip">
      <span class="dependency-chip-text" title={dependency}>{dependency}</span>
      <button
        type="button"
        class="dependency-chip-remove"
        aria-label={'Remove dependency ' + dependency}
        title={'Remove dependency ' + dependency}
        disabled={disabled}
        onclick={() => removeAt(index)}
      >×</button>
    </span>
  {/each}
  <input
    bind:this={inputElement}
    class="dependency-entry-input"
    type="text"
    value={pending}
    placeholder="Add dependency…"
    aria-label="Add dependency"
    aria-describedby="dependency-entry-hint"
    autocomplete="off"
    spellcheck="false"
    {disabled}
    oninput={onInput}
    onkeydown={onKeydown}
    onblur={() => { if (!composing) consumeInput(pending, true) }}
    oncompositionstart={() => { composing = true }}
    oncompositionend={(event) => {
      composing = false
      consumeInput((event.currentTarget as HTMLInputElement).value)
    }}
  />
</div>
<p id="dependency-entry-hint" class="dependency-entry-hint">Space, comma, or Enter adds a dependency.</p>
