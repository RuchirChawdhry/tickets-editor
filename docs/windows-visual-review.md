# Manual Windows visual review

The workflow **Windows visual review (manual)** runs when explicitly dispatched
or when a specially named visual-review ref is pushed. Ordinary commits to
`main` and normal pull requests do not trigger it. Accepted ref patterns:

- Tag: `windows-visual-*` (for example, `windows-visual-20261122`).
- Branch: `windows-visual-*` (for example, `windows-visual-20261122-01`).

The branch option lets the connected GitHub integration trigger the workflow
without GitHub Actions dispatch permission: create a fresh matching branch
from the desired commit. Branch creation itself triggers a push event; no
additional commit is necessary. GitHub's tag API is not available through
the current integration, although you can push a matching tag yourself.

A repeated push to the same trigger branch cancels an earlier incomplete run
for that branch. Use a new ref name for a separate deliberate run.

## Run it

1. Open the repository's **Actions** tab.
2. Select **Windows visual review (manual)**.
3. Select **Run workflow**, choose the **main** branch, and confirm.
4. Open the completed run and download the **tickets-editor-windows-visual** artifact.

The workflow builds the actual Electron app on a GitHub-hosted **windows-latest**
runner. Playwright opens it and tests the default title bar, project registration,
ticket editing, customization panel, pinning and ordering, 15 pinned commands,
the command palette, and saved preferences after restarting the application.

The test imports committed fixtures into **two separate temporary projects**:
`tests/fixtures/sample-tickets.jsonl` (16 tickets) and
`tests/fixtures/nested-tickets.json` (16 tickets in three milestone groups).
It checks both imports, then captures populated navigator, Ticket Fields and JSON
editor views. These are the real source-format import paths, not mocked tickets
rendered directly into the DOM.

Every captured state includes:

- **`*-renderer.png`**: Playwright screenshot of the Chromium renderer.
- **`*-window.png`**: Microsoft WinApp CLI's window-targeted Windows Graphics
  Capture image (the app's HWND, including native caption controls).
- **`report.txt`**: geometry assertions and diagnostic output.

The Windows workflow installs WinApp CLI via `microsoft/setup-WinAppCli`.
Capture uses `winapp ui screenshot -w <HWND> --output <PNG>`, **not**
`--capture-screen`. Unlike the previous PowerShell `CopyFromScreen` method,
WGC captures the actual DWM-composited window surface. The desktop and other
windows behind the app are excluded. If window-only capture fails, the test
fails rather than silently falling back to a desktop screenshot.

If a test fails, the artifact also includes **failure-renderer.png** when
possible. Artifacts upload even if the test fails.

The test checks title-bar height (42px), caption reservation (140px),
settings-control borders and placement immediately left of native caption
buttons, icon-only branding, typography sizing, and ticket population. It captures screenshots for
manual visual inspection; **it does not perform pixel-baseline comparisons**.

The test uses a temporary project directory and isolated Electron user-data
profile. It does not change the user's real projects.

## Local Windows run

Use PowerShell in the repository root:

    npm install
    winget install Microsoft.winappcli --source winget
    npm run build
    npm run test:visual:windows

Output files are saved in **artifacts/windows-visual/**.

The existing Ubuntu Slim source-check workflow remains separate and
does not run Windows GUI tests. A successful Windows test proves behavior on
the hosted Windows environment, not every Windows display configuration.
