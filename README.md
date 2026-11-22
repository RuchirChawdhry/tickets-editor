# TicketsEditor

A cross-platform Electron desktop workspace for reviewing and correcting agent-generated tickets across multiple projects.

## Architecture

- **Electron + Svelte + TypeScript**: desktop process, restricted preload bridge, and renderer.
- **SQLite**: central project and ticket library in the application's user-data directory.
- **Project file**: each registered project will expose a valid-JSON `.tickets` file at its root.
- **Link setup**: each project has a canonical AppData `projects/<project-uuid>/tickets.json`; its `<project>/.tickets` can be a **hardlink** (same volume) or **symbolic link** (also supports another drive). Existing files are never replaced silently.
- **Editor**: ticket navigator, editable humanized pane, readable JSON pane, multi-select and batch operations, nested JSON/JSONL imports, and compact JSON export (default). An integrated Windows title-bar foundation is present; advanced command palette and CodeMirror remain planned.

## Development

Use **Node.js 24** and npm on Windows, Linux, or macOS.

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

The current implementation includes SQLite-backed project registration and ticket CRUD, JSON/JSONL imports, a humanized/JSON editor, multi-select batch operations, AppData JSON with hardlink/symlink setup, filesystem-change notifications, explicit external import, revision restore and safe link repair with recovery backups. Read-only visual revision diffs are available. CodeMirror, undo/redo and configurable templates are still planned. Automatic three-way merging is intentionally out of scope.

See [docs/architecture.md](docs/architecture.md) and [docs/implementation-plan.md](docs/implementation-plan.md).

## Formatting conventions

Prettier is the sole formatter. The settings in `.prettierrc.json` are authoritative for future changes:

| Setting | Value |
| --- | --- |
| Indentation | 2 spaces |
| Line width | 100 characters |
| JS/TS quotes | Single |
| Semicolons | Required |
| Trailing commas | All supported locations |
| Arrow-function parentheses | Always |
| Svelte component block order | Script → Markup → Style (`svelte:options` metadata comes first when present) |
| Svelte attribute shorthand | Allowed |
| Line endings | LF |
| Script/style indentation in Svelte | No extra indentation |

`prettier-plugin-svelte` enforces Svelte block order via `svelteSortOrder: "options-scripts-markup-styles"`, shorthand via `svelteAllowShorthand: true`, and no extra script/style indentation via `svelteIndentScriptAndStyle: false`.

Run `npm run format` before submitting changes and `npm run format:check` to verify formatting. The `format:check` script exists; it is not yet a mandatory CI gate because existing source files have not undergone a repository-wide reformat. ESLint and Oxlint remain code-quality checks, not competing formatters.

## Code quality

The repository uses **ESLint + typescript-eslint + eslint-plugin-svelte** for complete JavaScript, TypeScript and Svelte linting, **svelte-check** plus TypeScript for type checking, and **Prettier + prettier-plugin-svelte** for formatting. Oxlint is an optional fast first pass for JS/TS files; Svelte templates stay under ESLint because Oxlint does not fully implement Svelte-specific template rules.

```sh
npm run lint:fast      # Optional fast first pass (Oxlint)
npm run lint           # Full ESLint + Svelte linting
npm run lint:all       # Oxlint first, then ESLint
npm run typecheck      # TypeScript + svelte-check
npm run format:check   # Prettier verification
npm run format         # Apply Prettier formatting
```

The mandatory Ubuntu Slim CI still runs the full `lint` and `typecheck` scripts. Oxlint is an optional local command and does not replace these checks.

## CI

GitHub Actions uses only `.github/workflows/ci-workflows.yml` on the `ubuntu-slim` runner for headless typechecking, linting, tests and bundle builds. No Windows or macOS CI jobs are configured. Platform packaging is separate from CI verification.

## Multi-ticket workflow

1. Register a project and optionally import an existing JSON or JSONL collection.
2. In Project Settings, choose **Hardlink** (same volume) or **Symbolic link** to expose the AppData canonical JSON as `<project>/.tickets`.
3. Ctrl-click individual tickets or Shift-click ranges to select multiple tickets. Use **Select visible** for filtered results.
4. Open **Batch edit** to append/remove dependencies, work items, tests, or success criteria; find and replace text; duplicate, move or delete the selection.
5. Copy or save **compact JSON** (default), pretty JSON, or JSONL. Full-project JSON exports retain the original nested document hierarchy.

When an external agent changes `.tickets`, the editor reports its state. The user explicitly chooses whether to import changed JSON, keep SQLite and back up external data, or repair a detached link. Recovery snapshots are kept in `<userData>/recovery/<project-uuid>/`. Detached file repair is never automatic.

## Visual revision diffs

Open **Project Settings → Revision history → Compare**. The read-only comparison viewer opens with the selected revision on the left and the current saved SQLite document on the right. Choose another revision on either side, inspect highlighted additions, deletions and changes, and use Previous/Next to navigate change groups. Unchanged lines are hidden except for nearby context; enable **Show unchanged lines** to view the entire document. Differences are computed on consistently pretty-printed JSON. This view never restores a revision or modifies project files.

## MCP agent integration

TicketsEditor includes a local, headless stdio MCP server using the same SQLite ticket service as the UI. Start it through the Electron executable with `--mcp` (not through an npm log-producing wrapper). Agents can discover, read, create, update, delete, batch-edit, duplicate, and reorder registered tickets; stale writes are rejected. See [MCP setup and tools](docs/mcp.md).
