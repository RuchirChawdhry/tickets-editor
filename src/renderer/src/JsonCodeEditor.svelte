<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView, basicSetup } from 'codemirror'
  import { Compartment } from '@codemirror/state'
  import type { Extension } from '@codemirror/state'
  import { keymap } from '@codemirror/view'
  import { indentWithTab, redo, undo, redoDepth, undoDepth } from '@codemirror/commands'
  import { json, jsonParseLinter } from '@codemirror/lang-json'
  import { lintGutter, linter } from '@codemirror/lint'
  import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
  import { tags } from '@lezer/highlight'
  import { ticketFieldDiagnostics, parseTicketDraft } from '../../shared/ticket-diagnostics'
  import type { AppTheme } from './app-theme'

  export let initialValue: string
  export let theme: AppTheme = 'dark'
  export let onChange: (value: string) => void

  let mountNode: HTMLDivElement
  let editor: EditorView | null = null
  const themeCompartment = new Compartment()

  // Reconfigure only presentation extensions. The document and undo history survive.
  $: if (editor) {
    editor.dispatch({ effects: themeCompartment.reconfigure(themeExtensions(theme)) })
  }

  const jsonColors = HighlightStyle.define([
    { tag: tags.propertyName, color: '#8bbbea' },
    { tag: tags.string, color: '#9ecfa9' },
    { tag: tags.number, color: '#eac092' },
    { tag: tags.bool, color: '#c2acee' },
    { tag: tags.null, color: '#c2acee' },
    { tag: tags.punctuation, color: '#9aa9bc' }
  ])

  const darkEditorTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
      color: '#d3deec',
      backgroundColor: '#20252d'
    },
    '.cm-scroller': {
      fontFamily: '"Cascadia Code", Consolas, ui-monospace, monospace',
      lineHeight: '1.55',
      overflow: 'auto'
    },
    '.cm-gutters': {
      color: '#7d8da1',
      backgroundColor: '#252d37',
      borderRight: '1px solid #384655'
    },
    '.cm-activeLine': { backgroundColor: '#2c364355' },
    '.cm-activeLineGutter': { backgroundColor: '#334050' },
    '.cm-cursor': { borderLeftColor: '#e3ebf5' },
    '.cm-selectionBackground': { backgroundColor: '#416b9544' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#5179a255' },
    '.cm-content': { padding: '10px 0', caretColor: '#e3ebf5' },
    '.cm-diagnostic-error': { borderLeftColor: '#d98c82' },
    '.cm-lintRange-error': { backgroundImage: 'none', borderBottom: '2px wavy #d98c82' },
    '.cm-tooltip': { backgroundColor: '#293340', color: '#e5ecf5', borderColor: '#526273' }
  }, { dark: true })

  const lightJsonColors = HighlightStyle.define([
    { tag: tags.propertyName, color: '#1e5c9a' },
    { tag: tags.string, color: '#176b43' },
    { tag: tags.number, color: '#a34e16' },
    { tag: tags.bool, color: '#7543a4' },
    { tag: tags.null, color: '#7543a4' },
    { tag: tags.punctuation, color: '#596776' }
  ])

  const lightEditorTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '13px',
      color: '#233140',
      backgroundColor: '#ffffff'
    },
    '.cm-scroller': {
      fontFamily: '"Cascadia Code", Consolas, ui-monospace, monospace',
      lineHeight: '1.55',
      overflow: 'auto'
    },
    '.cm-gutters': {
      color: '#677687',
      backgroundColor: '#f2f5f8',
      borderRight: '1px solid #d5dde6'
    },
    '.cm-activeLine': { backgroundColor: '#e9f1f955' },
    '.cm-activeLineGutter': { backgroundColor: '#e5ecf3' },
    '.cm-cursor': { borderLeftColor: '#1e2937' },
    '.cm-selectionBackground': { backgroundColor: '#9fc5ea77' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#81b1df88' },
    '.cm-content': { padding: '10px 0', caretColor: '#1e2937' },
    '.cm-diagnostic-error': { borderLeftColor: '#b42318' },
    '.cm-lintRange-error': { backgroundImage: 'none', borderBottom: '2px wavy #b42318' },
    '.cm-tooltip': { backgroundColor: '#ffffff', color: '#243140', borderColor: '#bdc9d6' }
  }, { dark: false })

  function themeExtensions(selected: AppTheme): Extension[] {
    return selected === 'dark'
      ? [syntaxHighlighting(jsonColors), darkEditorTheme]
      : [syntaxHighlighting(lightJsonColors), lightEditorTheme]
  }

  export function replaceDocument(text: string): void {
    if (!editor) return
    const previous = editor.state.doc.toString()
    if (previous === text) return
    // Dispatch through CodeMirror so changes originating in the form share
    // the same editor history as changes typed directly into the JSON pane.
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: text }
    })
  }

  export function undoEdit(): boolean {
    return editor ? undo(editor) : false
  }

  export function redoEdit(): boolean {
    return editor ? redo(editor) : false
  }

  export function focusEditor(): void {
    editor?.focus()
  }

  export function canUndoEdit(): boolean {
    return editor !== null && undoDepth(editor.state) > 0
  }

  export function canRedoEdit(): boolean {
    return editor !== null && redoDepth(editor.state) > 0
  }

  export function hasSelectedText(): boolean {
    const selection = editor?.state.selection.main
    return selection !== undefined && !selection.empty
  }

  export async function copySelectedText(cut = false): Promise<void> {
    if (!editor) return
    const selection = editor.state.selection.main
    if (selection.empty) return
    const text = editor.state.sliceDoc(selection.from, selection.to)
    await navigator.clipboard.writeText(text)
    if (cut) {
      editor.dispatch({
        changes: { from: selection.from, to: selection.to, insert: '' },
        selection: { anchor: selection.from },
        userEvent: 'delete.cut'
      })
    }
    editor.focus()
  }

  export async function pasteText(): Promise<void> {
    if (!editor) return
    const text = await navigator.clipboard.readText()
    if (!text) return
    const selection = editor.state.selection.main
    editor.dispatch({
      changes: { from: selection.from, to: selection.to, insert: text },
      selection: { anchor: selection.from + text.length },
      userEvent: 'input.paste'
    })
    editor.focus()
  }

  export function selectAllText(): void {
    if (!editor) return
    editor.dispatch({ selection: { anchor: 0, head: editor.state.doc.length } })
    editor.focus()
  }

  onMount(() => {
    const syntaxLinter = jsonParseLinter()
    editor = new EditorView({
      parent: mountNode,
      doc: initialValue,
      extensions: [
        basicSetup,
        json(),
        themeCompartment.of(themeExtensions(theme)),
        keymap.of([indentWithTab]),
        lintGutter(),
        linter(view => {
          const syntax = syntaxLinter(view)
          if (syntax.length) return syntax
          const text = view.state.doc.toString()
          const parsed = parseTicketDraft(text)
          if (parsed.parseError) {
            return [{
              from: 0,
              to: Math.min(text.length, 1),
              severity: 'error',
              message: parsed.parseError
            }]
          }
          return ticketFieldDiagnostics(text)
        }, { delay: 200 }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChange(update.state.doc.toString())
        })
      ]
    })

    return () => {
      editor?.destroy()
      editor = null
    }
  })
</script>

<div class="json-code-shell" bind:this={mountNode} aria-label="JSON code editor"></div>
