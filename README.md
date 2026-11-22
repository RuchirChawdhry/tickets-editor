# TicketsEditor

A Windows-first desktop workspace for reviewing and correcting agent-generated tickets across multiple projects.

## Architecture

- **Electron + Svelte + TypeScript**: desktop process, restricted preload bridge, and renderer.
- **SQLite**: central project and ticket library in the application's user-data directory.
- **Project file**: each registered project will expose a valid-JSON `.tickets` file at its root.
- **Link setup**: each project has a canonical AppData `projects/<project-uuid>/tickets.json`; its `<project>/.tickets` can be a **hardlink** (same volume) or **symbolic link** (also supports another drive). Existing files are never replaced silently.
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

The current implementation includes SQLite-backed project registration and ticket CRUD, JSON/JSONL imports, an initial humanized/JSON editing UI, AppData JSON files and user-selected hardlink/symlink setup. Full diff review, batch operations, auto file watching, repair, and advanced editors are still planned.

See [docs/architecture.md](docs/architecture.md) and [docs/implementation-plan.md](docs/implementation-plan.md).
