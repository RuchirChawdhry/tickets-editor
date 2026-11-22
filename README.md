# TicketsEditor

TicketsEditor is a cross-platform desktop application for reviewing and editing task tickets. It keeps tickets from different projects in one local library.

Edit common fields in a form. Use the JSON editor to change any field, including nested data.

## Features

- **Project library:** Register multiple projects. Each project has its own tickets and directory.
- **Two editing views:** Edit a ticket in a form or in the CodeMirror JSON editor. Both views use the same draft.
- **Validation:** Find missing ticket IDs, tasks, and success criteria. Correct JSON syntax errors in the editor.
- **Batch editing:** Select multiple tickets to change fields, replace text, duplicate tickets, change order, or delete tickets.
- **Import and export:** Import JSON or JSONL. Copy or save compact JSON, formatted JSON, or JSONL.
- **Revision history:** Restore an earlier document. Compare revisions in a read-only, side-by-side JSON view.
- **MCP access:** Let coding agents read and change tickets through the local MCP server.

## Run the application

Install [Node.js](https://nodejs.org/) 24 or later and npm.

```sh
git clone https://github.com/RuchirChawdhry/tickets-editor.git
cd tickets-editor
npm install
npm run dev
```

The application uses Electron, Svelte, TypeScript, and SQLite. The integrated title bar works on Windows, macOS, and Linux. Electron provides each system's window controls.

## Create or open a project

1. Select **+** in the title bar.
2. Enter a project name.
3. Select the project's directory.
4. Select **Register project**.
5. Select **Import JSON/JSONL** to load existing tickets. Or select **+ New** to create a ticket.

Select a ticket in the left pane. Edit its fields in the center pane or its JSON in the right pane.

Select **Save ticket** to save your changes.

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

GitHub Actions checks the source and builds on Ubuntu Slim. The workflow does not test a packaged desktop application.

## More information

- [MCP setup and tools](docs/mcp.md)
- [Architecture](docs/architecture.md)
- [Implementation plan](docs/implementation-plan.md)
