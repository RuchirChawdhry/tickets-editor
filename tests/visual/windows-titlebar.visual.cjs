'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'artifacts', 'windows-visual');
const nativeCapture = path.join(__dirname, 'capture-native-window.ps1');
const pinStorageKey = 'tickets-editor.titlebar.pins.v1';
const densePins = [
  'project.search', 'palette.open', 'ticket.save', 'project.import',
  'ticket.new', 'project.settings', 'ticket.format', 'ticket.undo',
  'ticket.redo', 'project.copy', 'project.export', 'ticket.duplicate',
  'ticket.selectVisible', 'ticket.batchEdit', 'project.verifyLink',
];

function log(message) {
  fs.appendFileSync(path.join(output, 'report.txt'), message + '\n');
  console.log(message);
}

async function launch(appData) {
  const env = { ...process.env, APPDATA: appData };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_RENDERER_URL;
  const application = await electron.launch({
    executablePath: require('electron'), args: [root], cwd: root,
    env, timeout: 45000,
  });
  const page = await application.firstWindow();
  await page.locator('.titlebar').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.statusbar').waitFor({ state: 'visible' });
  await application.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const area = screen.getPrimaryDisplay().workArea;
    win.setBounds({
      x: area.x + 20, y: area.y + 20,
      width: Math.max(900, Math.min(1120, area.width - 50)),
      height: Math.max(570, Math.min(740, area.height - 50)),
    });
    win.show();
    win.focus();
  });
  return { application, page };
}

async function screenshot(application, page, name) {
  await page.screenshot({
    path: path.join(output, name + '-renderer.png'), animations: 'disabled',
  });
  // Native caption buttons are not included in a Playwright page screenshot.
  const handle = await application.evaluate(({ BrowserWindow }) => {
    const buffer = BrowserWindow.getAllWindows()[0].getNativeWindowHandle();
    return (buffer.length === 8
      ? buffer.readBigUInt64LE(0)
      : BigInt(buffer.readUInt32LE(0))).toString();
  });
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', nativeCapture,
    '-WindowHandle', handle,
    '-OutputPath', path.join(output, name + '-window.png'),
  ], { cwd: root, timeout: 20000 });
  log(name + ': renderer and native window captured');
}

async function checkGeometry(page) {
  const rect = await page.evaluate(() => {
    const bar = document.querySelector('.titlebar').getBoundingClientRect();
    const controls = document.querySelector('.title-actions').getBoundingClientRect();
    const native = document.querySelector('.caption-reserved').getBoundingClientRect();
    return {
      height: Math.round(bar.height),
      reserved: Math.round(native.width),
      controlsRight: Math.round(controls.right),
      reservedLeft: Math.round(native.left),
    };
  });
  assert.equal(rect.height, 42, 'Title bar must remain 42px high');
  assert.equal(rect.reserved, 140, 'Windows caption reservation must remain 140px');
  assert.ok(rect.controlsRight <= rect.reservedLeft + 1,
    'Pinned commands must not overlap caption controls');
  log('Title bar geometry: ' + JSON.stringify(rect));
}

test('manual Windows Electron visual review', { timeout: 240000 }, async () => {
  assert.equal(process.platform, 'win32', 'Run on Windows only');
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'report.txt'), '');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tickets-editor-visual-'));
  const appData = path.join(temp, 'AppData', 'Roaming');
  const project = path.join(temp, 'ExampleProject');
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(project, { recursive: true });

  let session;
  try {
    session = await launch(appData);
    let { application, page } = session;
    await checkGeometry(page);
    assert.equal(await page.locator('.title-pinned-action').count(), 5);
    await screenshot(application, page, '01-default-titlebar');

    await page.locator('.tabs .title-action').click();
    await page.locator('#project-name').fill('Windows Visual QA');
    await page.locator('#project-path').fill(project);
    await page.locator('.project-dialog .dialog-actions .primary').click();
    await page.locator('.tab.active').filter({ hasText: 'Windows Visual QA' })
      .waitFor({ state: 'visible' });
    await page.locator('.title-pinned-action[aria-label="New ticket"]').click();
    await page.locator('#ticket-task').fill('Verify the native Windows title bar');
    await page.locator('.title-pinned-action[aria-label="Save ticket"]').click();
    await page.locator('.unsaved').waitFor({ state: 'detached' });
    await screenshot(application, page, '02-project-and-editor');

    await page.getByRole('button', { name: 'Customize title-bar commands' }).click();
    await page.locator('.titlebar-customizer').waitFor({ state: 'visible' });
    await screenshot(application, page, '03-customizer');
    await page.locator('.titlebar-customize-search').fill('Format ticket JSON');
    await page.getByRole('button', { name: 'Pin Format ticket JSON' }).click();
    await page.locator('.title-pinned-action[aria-label="Format ticket JSON"]')
      .waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Move Format ticket JSON left' }).click();
    await page.getByRole('button', { name: 'Close title-bar customization' }).click();
    assert.equal(await page.locator('.title-pinned-action').count(), 6);
    await screenshot(application, page, '04-customized-titlebar');

    // Load a dense preference to check horizontal overflow and safe caption space.
    await page.evaluate(({ key, pins }) => {
      localStorage.setItem(key, JSON.stringify(pins));
    }, { key: pinStorageKey, pins: densePins });
    await page.reload();
    await page.locator('.title-pinned-action').first().waitFor();
    assert.equal(await page.locator('.title-pinned-action').count(), densePins.length);
    await checkGeometry(page);
    await screenshot(application, page, '05-fifteen-pinned-commands');

    await page.keyboard.press('Control+Shift+P');
    await page.locator('.command-palette').waitFor({ state: 'visible' });
    await screenshot(application, page, '06-command-palette');
    await page.keyboard.press('Escape');
    await page.locator('.command-palette').waitFor({ state: 'detached' });

    await application.close();
    session = null;
    session = await launch(appData);
    ({ application, page } = session);
    await page.locator('.title-pinned-action').first().waitFor();
    assert.equal(await page.locator('.title-pinned-action').count(), densePins.length);
    await checkGeometry(page);
    await screenshot(application, page, '07-after-restart');
    log('PASS: Windows Electron title-bar review');
  } catch (error) {
    log('FAIL: ' + String(error?.stack || error));
    if (session) {
      try {
        await session.page.screenshot({
          path: path.join(output, 'failure-renderer.png'), timeout: 5000,
        });
      } catch { /* Preserve the original test failure. */ }
    }
    throw error;
  } finally {
    if (session) await session.application.close().catch(() => {});
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
