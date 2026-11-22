# TicketsEditor MCP server

TicketsEditor exposes its existing SQLite ticket library to local coding agents through the Model Context Protocol (MCP). It uses the official TypeScript SDK v2 and **stdio**, not HTTP. The MCP client starts TicketsEditor with the `--mcp` switch. No UI window opens in this mode.

## Build and launch

~~~bash
npm install
npm run build
# For manual testing, starts headless MCP mode (waits for JSON-RPC on stdin):
npx electron . --mcp
~~~

For Codex or another MCP client, **do not launch via npm**: npm logs to stdout during a build, but MCP needs stdout exclusively for protocol messages. Point the client directly at the Electron executable, with the app path when using a development checkout.

### Installed Windows application

In `~/.codex/config.toml`, adjust the executable path to match your installation:

~~~toml
[mcp_servers.tickets_editor]
command = 'C:\Program Files\TicketsEditor\TicketsEditor.exe'
args = ["--mcp"]
~~~

### Source checkout (Windows)

After `npm run build`:

~~~toml
[mcp_servers.tickets_editor]
command = 'C:\full\path\to\tickets-editor\node_modules\electron\dist\electron.exe'
args = ['C:\full\path\to\tickets-editor', '--mcp']
~~~

On macOS and Linux, use the full path to the installed TicketsEditor executable or the Electron runtime in your source checkout. Pass the app directory as an argument when using the bare Electron runtime. MCP host settings vary, but all stdio hosts accept a command with arguments.

Generic MCP configuration:

~~~json
{
  "mcpServers": {
    "tickets-editor": {
      "command": "/absolute/path/to/TicketsEditor",
      "args": ["--mcp"]
    }
  }
}
~~~

## Tools

| Tool | Purpose |
|---|---|
| `list_projects` | Discover registered projects and their UUIDs |
| `get_project_document` | Read the complete, nested SQLite JSON document |
| `list_tickets` | Search and paginate ticket summaries, with hashes |
| `get_ticket` | Read one complete ticket and its `version_sha256` |
| `create_ticket` | Create a draft or a complete ticket from JSON payload |
| `update_ticket` | Replace a ticket if `expected_sha256` still matches |
| `delete_ticket` | Delete a ticket if `expected_sha256` still matches |
| `batch_edit_tickets` | Append/remove array items or replace text |
| `duplicate_tickets` | Duplicate tickets with new ticket IDs |
| `move_tickets` | Move tickets up/down within their original array |
| `get_link_status` | Inspect the canonical AppData JSON link |

## Agent workflow

1. Register a project once in the TicketsEditor application.
2. Call `list_projects` to find its `project_uuid`.
3. Call `list_tickets` or `get_project_document` to inspect it.
4. Call `get_ticket` to retrieve the ticket UUID and version hash.
5. Call `update_ticket` with the updated JSON and that hash.

The server rejects stale update or delete requests so an agent cannot overwrite a newer ticket edit without rereading it.

## Storage rules

The **SQLite library is authoritative**. The Electron UI and the MCP server call the same `TicketWorkspace` service. Mutations acquire SQLite's immediate write lock, verify the linked AppData JSON state, update SQLite and synchronize its JSON projection. The project-root `.tickets` remains a hardlink or symlink to that AppData file, **not** an independent editing branch.

Agents must **not** write to `.tickets` directly. Unexpected external file edits are reported as integrity/recovery events; no automatic three-way merge subsystem is planned.

## Testing

`npm test` runs MCP client/server protocol tests in memory, including discovery, input validation and version checks. `npm run build` bundles an ESM entry at `out/mcp/server.mjs` for Electron's headless main process. GitHub Actions runs on **ubuntu-slim only**, without opening a graphical window.

Launching the packaged executable in MCP mode on Windows/macOS and testing simultaneous GUI and MCP sessions are separate release checks. Do not assume those have passed merely because headless CI is green.
