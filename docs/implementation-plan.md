# Implementation plan

The repo starts as a runnable scaffold, not a completed editor.

## Delivered in scaffold

- Electron + Svelte + TypeScript app with Windows native title-bar overlay shell.
- Secure, narrow preload bridge and IPC handlers for version and workspace summary.
- SQLite database initialization and migrations with projects, documents, tickets, revisions, sync_state, and link mode.
- Pure ticket validation requiring success_criteria.
- Pure JSON/JSONL parsing and nested ticket location indexing.
- Vitest unit tests, ESLint, formatting, TypeScript checking, Windows CI and packaging configuration.

## Next milestones (dependency order)

### 1. Project library and persistence

Implement register/edit/remove project, absolute project-root validation, ticket/document CRUD, transaction handling and revision writes. SQLite must contain complete per-project ticket JSON.

### 2. Managed .tickets file

Generate each project's canonical `tickets.json` under Windows AppData at `<app.getPath('userData')>/projects/<project-uuid>/tickets.json`. Provide **hardlink (same volume)** and **symlink (cross-volume)** setup choices, verify link identity, and refuse to overwrite unrelated files. Initial setup and verification are implemented; implement automatic watching, conflict workflows, repair and recovery next. Do not create managed backing files inside projects.

### 3. Multi-document UX

Add integrated document tabs (not ticket tabs), pinned commands, shared command registry, status bar, navigation search and resizable panes. The navigation cards say Ticket <number>, not the ticket ID; the ID appears at the bottom-right.

### 4. Editing

Build dynamic template-driven human pane and CodeMirror JSON pane. Both edit shared state. Keep comfortably formatted JSON in the editor. Include nested-field editing, array reorder, multi-select/batch corrections, duplicate and undo/redo.

### 5. Import/export/validation

Complete nested JSON and JSONL imports, collision diagnostics, draft-friendly validation, schema-aware ticket review, and compact JSON export by default. Preserve arbitrary custom properties.

### 6. Windows QA and release

Add full Windows integration tests for database IO, hardlink file identity, external editor replacement, corruption recovery, packaged runtime, keyboard workflow and context menus.

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
