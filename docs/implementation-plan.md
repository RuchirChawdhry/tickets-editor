# Implementation plan

The repo starts as a runnable scaffold, not a completed editor.

## Delivered in scaffold

- Electron + Svelte + TypeScript app with Windows native title-bar overlay shell.
- Secure, narrow preload bridge and IPC handlers for version and workspace summary.
- SQLite database initialization and migrations with projects, documents, tickets, revisions, sync_state, and link mode.
- Pure ticket validation requiring success_criteria.
- Pure JSON/JSONL parsing and nested ticket location indexing.
- Vitest unit tests, ESLint, formatting, TypeScript checking, Ubuntu Slim CI and cross-platform packaging configuration.

## Next milestones (dependency order)

### 1. Project library and persistence

Delivered: register/edit/remove project, absolute project-root validation, ticket/document CRUD, SQLite transactions and revision writes. All projects' complete ticket documents live in SQLite.

### 2. Managed .tickets file

Generate each project's canonical `tickets.json` under Windows AppData at `<app.getPath('userData')>/projects/<project-uuid>/tickets.json`. Provide **hardlink (same volume)** and **symlink (cross-volume)** setup choices, verify link identity, and refuse to overwrite unrelated files. Setup, verification, filesystem notifications, explicit external import, revision restore, backup-before-repair and conflicting file detection are implemented. Improve crash recovery, safe merge previews and link-type changes next. Do not create managed backing files inside projects.

### 3. Multi-document UX

Add integrated document tabs (not ticket tabs), pinned commands, shared command registry, status bar, navigation search and resizable panes. The navigation cards say Ticket <number>, not the ticket ID; the ID appears at the bottom-right.

### 4. Editing

Build dynamic template-driven human pane and CodeMirror JSON pane. Both edit shared state. Keep comfortably formatted JSON in the editor. Current editor supports multi-select with Ctrl/Shift, array field batch edits, text replacement, nested-document preservation, duplication, move up/down, delete selection and export. Add schema-driven nested-field widgets, keyboard command registry, CodeMirror and undo/redo.

### 5. Import/export/validation

Current JSON/JSONL imports and compact/pretty/JSONL exports work. Finish duplicate-ID diagnostics, schema-aware validation summary, diff review and source-preserving export options. Preserve arbitrary custom properties.

### 6. Cross-platform QA and release

Keep CI limited to Ubuntu Slim. Add full native integration tests later for each OS, SQLite/database/file crash recovery, external editor replacement, packaged runtime, keyboard workflow and context menus.

The broader dependency-ordered implementation plan is maintained as a separate 42-ticket JSON/JSONL batch. The scaffold implements only its initial foundation; do not mark feature tickets complete on the strength of this documentation alone.

## Success and acceptance

Each implementation ticket has a nonempty success_criteria array. Any claim of completion requires the ticket's specified tests and criteria to pass.

## Validation commands

~~~powershell
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
~~~

On Windows, the native SQLite module may need a C++ build toolchain if a matching prebuilt binary is unavailable. The postinstall script invokes electron-builder's native dependency rebuild mechanism.
