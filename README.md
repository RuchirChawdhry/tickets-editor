# TicketsEditor

TicketsEditor is a desktop application for reviewing and editing task tickets. It keeps tickets from different projects in one local library.

Edit common fields in a form. Use the JSON editor to change any field, including nested data.

## Features

- **Project library:** Register multiple projects. Each project has its own tickets and directory.
- **Two editing views:** Edit a ticket in a form or in the CodeMirror JSON editor. Both views use the same draft.
- **Validation:** Find missing ticket IDs, tasks, and success criteria. Correct JSON syntax errors in the editor.
- **Batch editing:** Select multiple tickets to change fields, replace text, duplicate tickets, change order, or delete tickets.
- **Import and export:** Import JSON or JSONL. Copy or save compact JSON, formatted JSON, or JSONL.
- **Revision history:** Restore an earlier document. Compare revisions in a read-only, side-by-side JSON view.
- **MCP access:** Let coding agents read and change tickets through the local MCP server.
- **Customizable title bar:** Pin frequently used commands and change their order.

## Run the application

Install [Node.js](https://nodejs.org/) 24 or later and npm.

```sh
git clone https://github.com/RuchirChawdhry/tickets-editor.git
cd tickets-editor
npm ci
npm run dev
```

The application uses Electron, Svelte, TypeScript, and SQLite.

## Create or open a project

1. Select the **folder-plus icon** after the project tabs.
2. Enter a project name.
3. Select the project's directory.
4. Select **Register project**.
5. Select **Import JSON/JSONL** to load existing tickets. Or select **+ New** to create a ticket.

Select a ticket in the left pane. Edit its fields in the center pane or its JSON in the right pane.

Select **Save ticket** to save your changes.

### Sample ticket projects

The repository includes two synthetic ticket collections for visual testing and
import/export verification:

- `tests/fixtures/sample-tickets.jsonl` — 16 flat JSONL tickets.
- `tests/fixtures/nested-tickets.json` — 16 tickets grouped into nested milestones.

Register any project directory, then choose **Import JSON/JSONL** and select either
fixture to populate the navigator, Ticket Fields pane and JSON editor.
The manual Windows visual workflow imports both collections automatically into
temporary sample projects. No synthetic tickets are written to your real projects.

### Ticket format

A ticket can contain these fields:

```json
{
  "id": "dll-004",
  "task": "Index DLL exports",
  "deps": ["dll-002"],
  "work": ["Read the export table"],
  "tests": ["Check export names"],
  "success_criteria": ["Save all exported names"]
}
```

TicketsEditor also keeps custom fields and nested objects. Edit these fields in the JSON pane.

### Command palette

Press **Ctrl+Shift+P** or **Cmd+Shift+P** to open the command palette. You can also select
**Commands** in the title bar. Type to find an action, use the arrow keys to select it,
and press **Enter** to run it. Press **Esc** to close the palette.

Commands share their actions with the title bar and ticket controls. Unavailable actions
remain visible but cannot run. Use **Ctrl+K** or **Cmd+K** to focus ticket search.

### Customize title-bar commands

Select the **sliders/settings icon** directly left of the Windows minimize button, or run **Customize title bar** from the command palette, to open the customization panel.
Search for a command, then select **Pin** or **Unpin**. Move a pinned command with
the left and right controls, or drag its icon along the title bar. Select
**Restore defaults** to return to the original five commands.

The application saves these preferences locally. They apply to all registered projects
and remain in place when you restart the application. Unavailable commands stay visible
but cannot run.

### Edit multiple tickets

Use **Ctrl-click** to select individual tickets. Use **Shift-click** to select a range.

Select **Batch edit** to change the selected tickets. You can add or remove list items, replace text, duplicate tickets, change their order, or delete them.

Choose a format to copy or save the selected tickets. Compact JSON is the default format.

### Review revisions

1. Open **Project settings**.
2. Find **Revision history**.
3. Select **Compare** to view changes between two saved versions.
4. Select **Restore** to return to an earlier version.

The comparison view does not change ticket data.

## Project files

SQLite stores the ticket library in the application's user-data directory.

For each project, TicketsEditor maintains a JSON file at:

```text
<user-data>/projects/<project-uuid>/tickets.json
```

You can expose this file as `<project-directory>/.tickets`:

1. Open **Project settings**.
2. Select **Hardlink** or **Symbolic link**.
3. Select **Set Up .tickets Link**.

A hardlink requires both files to be on the same volume. A symbolic link can point to another volume.

TicketsEditor updates the JSON file when it saves ticket changes. It checks the link and reports unexpected file changes. The settings page provides file recovery and link repair controls.

## Agent access through MCP

TicketsEditor includes a local Model Context Protocol (MCP) server. Agents can find projects, read tickets, and make ticket changes through this server.

The server uses the same SQLite ticket service as the desktop application. It runs without an application window and communicates through standard input and output.

See [MCP setup and tools](docs/mcp.md) for client configuration and the tool list.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the desktop application |
| `npm run typecheck` | Check TypeScript and Svelte types |
| `npm run lint` | Run ESLint |
| `npm run lint:fast` | Run Oxlint |
| `npm test` | Run unit tests |
| `npm run format` | Format source files with Prettier |
| `npm run build` | Build the Electron application and MCP server |
| `npm run dist:win` | Build NSIS `.exe` and MSI `.msi` installers on Windows |

GitHub Actions runs source checks on pushes and pull requests. A separate **tagged release workflow** builds native packages on Windows, Ubuntu and macOS, then publishes a GitHub Release only when every build succeeds.

### Publish a desktop release

1. Update `package.json`'s `version` to the new version (for example `0.1.0`).
2. Commit the changes to `main`, and ensure its CI checks pass.
3. Create and push a matching version tag:

```sh
git checkout main
git pull --ff-only
git tag -a v0.1.0 -m "TicketsEditor 0.1.0"
git push origin v0.1.0
```

**The tag must match the version in `package.json` exactly**, prefixed with `v`. A mismatched tag fails before packaging. Tags such as `v0.2.0-beta.1` publish as prereleases.

The workflow at [`.github/workflows/release.yml`](.github/workflows/release.yml) creates:

| Platform | Architecture | Packages |
| --- | --- | --- |
| Windows | x64 | NSIS `.exe` and native Windows Installer `.msi` |
| Ubuntu / Debian | x64 | `.AppImage` and `.deb` |
| macOS | Intel x64 | `.dmg` and `.zip` |
| macOS | Apple Silicon arm64 | `.dmg` and `.zip` |

Each runner installs and builds its own native dependencies, including SQLite. All eight packages use unique platform/architecture filenames. GitHub Actions assembles the packages, checks that none are missing, creates `SHA256SUMS.txt`, and attaches everything to the GitHub Release with automatically generated release notes.

**Signing:** Both NSIS and MSI builds are currently **unsigned** and macOS builds are **not notarized**. Windows SmartScreen and macOS Gatekeeper may warn or block normal installation. Configure signing and Apple notarization before distributing to general users.

The repository commits `package-lock.json`. All CI workflows install the pinned dependency tree with `npm ci --no-audit --no-fund` on their native operating system. When dependencies change, regenerate and commit the lockfile with `npm install` before pushing. The ordinary CI workflow does not test packaged apps, and the Windows GUI screenshot workflow remains manual.

## More information

- [MCP setup and tools](docs/mcp.md)
- [Architecture](docs/architecture.md)
- [Implementation plan](docs/implementation-plan.md)
