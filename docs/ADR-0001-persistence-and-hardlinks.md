# ADR 0001 — SQLite library plus project .tickets hardlinks

Status: Accepted architectural direction (implementation pending)

## Requirements

- A centralized SQLite database must store ticket JSON for all registered projects.
- The user configures each project's **absolute path**.
- A dedicated setup button creates a project-root file named **.tickets**, with valid JSON content.
- The project file should be a hardlink to a managed JSON backing file, avoiding uncoordinated ticket-file copies.
- Agents can read and edit .tickets without requiring TicketsEditor to run.
- Nested JSON and JSONL are import formats; .tickets remains valid JSON.

## Physical layout

SQLite is stored under Electron's userData directory. A hardlink targets an inode/file object, **not** a SQLite row. Both link paths must refer to files on the same filesystem volume. Therefore, a managed JSON backing file must be stored on the project's volume.

For a project at D:/Projects/DLLViewer, the default managed backing path can be:

~~~text
D:/Projects/DLLViewer/.tickets-editor/data.json   (managed backing file)
D:/Projects/DLLViewer/.tickets                    (hardlink to data.json)
~~~

Store the backing path in sync_state so a future user-configurable same-volume store can be supported. The backing directory is an implementation detail, not another competing ticket entry point.

## Set Up .tickets action

1. Resolve and validate the registered project root.
2. Inspect an existing .tickets: never overwrite or unlink without an explicit import/reconcile decision.
3. Choose or create a managed JSON backing file on the same volume.
4. Atomically write valid JSON to a temporary file and safely install the new backing file.
5. Create a hardlink at <project-root>/.tickets using the platform hardlink API.
6. Verify both paths identify the same underlying filesystem file; verify content parses as JSON.
7. Store the relative/absolute paths, identity and checksum in sync_state.
8. Report actionable errors for different volumes, unsupported filesystems, permissions, conflict, or occupied target.

Hardlinks are not symlinks. Do not replace them with a copy and still label the operation successful.

## Detecting changed files

Some editors save by writing a new temporary file and renaming it over .tickets. This can break the hardlink even though the path remains. On file watcher events and application resume, compare file identity and content hashes. Show an explicit **Repair hardlink** action when the link is broken.

A write by TicketsEditor to an existing hardlinked file should preserve the file identity when possible. It must not overwrite external changes without checking the last synchronized hash.

## SQLite synchronization

- The accepted SQLite representation and canonical JSON file are linked by explicit sync_state.
- App edits: validate, commit SQLite transaction, write JSON, and update sync metadata; recover or flag divergence on partial failures.
- External edits: parse changed JSON, compare against the common last-synced state, and import, prompt for merge, or flag a conflict.
- A file conflict does not silently replace a newer edit.
- Maintain revision snapshots to permit recovery.
- A missing/invalid file must be reported without deleting tickets from SQLite.

## Out of scope for this ADR

Cloud sync, network shares, hardlinks across volumes, symlink-based fallback, and automatic repair that destroys externally changed content.
