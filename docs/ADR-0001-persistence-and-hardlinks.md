# ADR 0001 — SQLite library plus AppData JSON hardlinks

Status: Accepted design; implementation pending.

## Canonical storage

TicketsEditor stores **one canonical `tickets.json` per project in the Windows AppData user-data directory** obtained from Electron `app.getPath('userData')`. Do not derive this from the application's installation location. SQLite stores all tickets across all projects.

~~~text
%APPDATA%/TicketsEditor/
  tickets-editor.sqlite
  projects/
    <project-uuid-A>/tickets.json
    <project-uuid-B>/tickets.json

C:/Projects/DLLViewer/.tickets     (hardlink to AppData/projects/<project-uuid-A>/tickets.json)
C:/Projects/CourseStudio/.tickets  (hardlink to AppData/projects/<project-uuid-B>/tickets.json)
~~~

Illustrative paths only. The project-root `.tickets` and its matching AppData `tickets.json` are two names for the same file, not copies. The project's `.tickets` file must contain valid JSON even when source tickets were imported as JSONL.

## Project registration and hardlink setup

1. Register the absolute full path of the project directory.
2. Create or locate the canonical `<userData>/projects/<project-uuid>/tickets.json`.
3. Serialize the accepted document to valid JSON.
4. If `<project-root>/.tickets` already exists, inspect and reconcile first; never overwrite unreviewed data.
5. Check that the AppData JSON and project root reside on the **same filesystem volume**; Windows hardlinks cannot cross volumes. Reject cross-volume setup with a clear error; never silently copy, symlink, or create a project-local alternate JSON file.
6. Create hardlink `<project-root>/.tickets` pointing to the canonical AppData file.
7. Verify file identity, parse the JSON, and record both paths, checksum, and link state in `sync_state`.

The UI action is **Set Up .tickets Hardlink**.

## Synchronization and recovery

- App changes update SQLite and the canonical AppData JSON, with explicit recovery state for failures.
- External edits to an intact `.tickets` hardlink are edits to the AppData JSON file.
- Watch changes and recheck hashes/file identity on resume. Compare incoming JSON with the last accepted revision.
- Some editors save by atomic replacement. Replacing the project's `.tickets` can break the hardlink. Detect the file identity change, preserve external edits, and prompt for safe link repair.
- App writes to the canonical JSON must preserve the existing file object while a link is active; replacing the canonical path through rename severs the hardlink.
- Never discard tickets on missing/invalid JSON or silently overwrite newer external data.
- Accepted revisions must permit recovery.

## Explicit constraints

No hardlinks across volumes, no project-local managed backing JSON files, no silent fallback to file copies or symlinks, and no destructive automatic link repair.
