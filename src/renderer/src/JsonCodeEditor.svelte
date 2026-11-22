<script lang="ts">
  import { onMount } from 'svelte'
  import { EditorView, basicSetup } from 'codemirror'
  import { keymap } from '@codemirror/view'
  import { indentWithTab, redo, undo } from '@codemirror/commands'
  import { json, jsonParseLinter } from '@codemirror/lang-json'
  import { lintGutter, linter } from '@codemirror/lint'
  import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
  import { tags } from '@lezer/highlight'
  import { ticketFieldDiagnostics, parseTicketDraft } from '../../shared/ticket-diagnostics'

  export let initialValue: string
  export let onChange: (value: string) => void

  let mountNode: HTMLDivElement
  let editor: EditorView | null = null

  const jsonColors = HighlightStyle.define([
    { tag: tags.propertyName, color: '#8bbbea' },
    { tag: tags.string, color: '#9ecfa9' },
    { tag: tags.number, color: '#eac092' },
    { tag: tags.bool, color: '#c2acee' },
    { tag: tags.null, color: '#c2acee' },
    { tag: tags.punctuation, color: '#9aa9bc' }
  ])

  const editorTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontSize: '12px',
      color: '#d3deec',
      backgroundColor: '#20252d'
    },
    '.cm-scroller': {
      fontFamily: 'Consolas, "Cascadia Code", monospace',
      lineHeight: '1.75',
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

  onMount(() => {
    const syntaxLinter = jsonParseLinter()
    editor = new EditorView({
      parent: mountNode,
      doc: initialValue,
      extensions: [
        basicSetup,
        json(),
        syntaxHighlighting(jsonColors),
        editorTheme,
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
