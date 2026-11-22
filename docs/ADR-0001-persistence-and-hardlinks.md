# ADR 0001 — SQLite library, application-data JSON, and project file links

Status: Accepted. Link creation, verification, explicit reconciliation and backup-before-repair are implemented. Crash-atomic cross-store writes remain future work. Automatic three-way merging is intentionally excluded.

## Canonical storage

TicketsEditor keeps one canonical JSON document per project under Electron's `app.getPath('userData')` directory on every supported operating system, independent of the installation directory.

~~~text
<userData>/
  tickets-editor.sqlite
  projects/
    <project-uuid-A>/tickets.json
    <project-uuid-B>/tickets.json

<project-A>/.tickets        (hardlink or symlink to A)
<project-B>/.tickets        (symlink to B)
~~~

Each `.tickets` is a reference to the matching AppData `tickets.json`, never another independent JSON copy. SQLite stores the searchable multi-project ticket library and revision history. The canonical file must always be valid JSON; source JSONL is normalized to JSON.

## Link modes

| Mode | Behavior |
| --- | --- |
| `hardlink` | Shares the canonical file's identity. Both paths must be on the same filesystem. |
| `symlink` | Points to the canonical file by absolute path. Can cross filesystems. Windows may require Developer Mode or symbolic-link privileges. |

The user chooses the mode explicitly from project settings. Failed link setup must not silently fall back to a copy, symlink, or hardlink of another type. A preexisting unrelated `.tickets` is never overwritten.

## Setup

1. Register an existing project directory using its full absolute path.
2. Initialize `<userData>/projects/<project-uuid>/tickets.json` from the SQLite document.
3. Click **Set Up .tickets Link**, choose **Hardlink** or **Symbolic link**.
4. Inspect the target path. If `.tickets` already exists but is not the desired link, stop rather than replace it.
5. For a hardlink, attempt creation and report the operating system's cross-device error; do not reject based on an unreliable directory/device precheck.
6. For a symlink, use an absolute file target so cross-volume projects work.
7. Verify same file identity (hardlink) or actual resolved path (symlink).
8. Record link type, checksum, path and file identity in `sync_state`.

## Editing and synchronization

- App edits validate project file state before modifying SQLite. After committing the accepted document, rewrite the same canonical AppData file in place and update sync metadata.
- In-place writes preserve hardlink identity. The same target also remains reachable via symlink.
- External modifications to an intact `.tickets` file change canonical JSON and must not be silently overwritten.
- File watchers refresh link health in the renderer; users explicitly import external JSON. The import stores both old SQLite content and external JSON in AppData recovery files and writes a new SQLite revision.
- Some text editors replace `.tickets` instead of writing through it. This can sever hardlinks or replace symlinks. Detect and report broken links. Reconcile changes before offering destructive repair.
- The application can restore a selected SQLite revision or overwrite the AppData JSON from SQLite after user confirmation and recovery snapshots. It detects broken links and allows explicit repair, backing up detached contents first. Cross-store crash-atomic commits and safe link-type switching are future milestones; automatic three-way merging is not planned.

## Explicit constraints

Do not change this design to project-local backing files. Do not relocate canonical JSON outside AppData without user approval. Do not silently create copies, remove unrelated project files, or claim a link is valid without verification.
