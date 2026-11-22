# TicketsEditor

A Windows-first desktop workspace for reviewing and correcting agent-generated tickets across multiple projects.

## Architecture

- **Electron + Svelte + TypeScript**: desktop process, restricted preload bridge, and renderer.
- **SQLite**: central project and ticket library in the application's user-data directory.
- **Project file**: each registered project will expose a valid-JSON `.tickets` file at its root.
- **Hardlink setup (planned)**: a managed JSON backing file on the *same volume* as the project will be hardlinked to `<project>/.tickets`. SQLite records cannot be hardlinked.
- **Editor (planned)**: ticket navigator, editable humanized pane, pretty JSON pane, multi-ticket operations, nested JSON / JSONL imports, compact JSON export, and a Borumi-like integrated Windows title bar.

## Development

Use **Node.js 24** and npm on Windows.

```powershell
npm install
npm run dev
```

Useful checks:

```powershell
npm run typecheck
npm test
npm run build
```

`npm run dist:win` builds an unsigned Windows installer once packaging is ready.

## Scope of the initial scaffold

This commit establishes the app shell, central SQLite schema, typed IPC boundary, validation rules, tests, and architecture docs. Ticket editing, project registration, file synchronization, and hardlink creation are **not implemented yet**.

See [docs/architecture.md](docs/architecture.md) and [docs/implementation-plan.md](docs/implementation-plan.md).
