import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import electronPath from 'electron';

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(sourceDirectory, '../..');
const output = path.join(root, 'artifacts', 'windows-visual');
const fixtures = path.join(root, 'tests', 'fixtures');
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
    executablePath: electronPath, args: [root], cwd: root,
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
  const pngPath = path.join(output, name + '-window.png');
  // WGC captures the HWND's own DWM surface, not the background desktop.
  // Do not use --capture-screen: it includes desktop overlays and occlusions.
  const result = execFileSync('winapp', [
    'ui', 'screenshot', '-w', handle,
    '--output', pngPath,
  ], { cwd: root, timeout: 30000, encoding: 'utf8' });
  assert.ok(fs.statSync(pngPath).size > 1000, 'WinApp CLI PNG is missing or empty');
  log(name + ': Playwright renderer + WinApp CLI HWND screenshot (' +
    String(result).trim() + ')');
}

async function checkGeometry(page) {
  const rect = await page.evaluate(() => {
    const bar = document.querySelector('.titlebar').getBoundingClientRect();
    const controls = document.querySelector('.title-actions').getBoundingClientRect();
    const native = document.querySelector('.caption-reserved').getBoundingClientRect();
    const customize = document.querySelector('.titlebar-customize-trigger').getBoundingClientRect();
    const settingsElement = document.querySelector('.titlebar-settings-trigger');
    const settings = settingsElement.getBoundingClientRect();
    const borders = getComputedStyle(settingsElement);
    return {
      height: Math.round(bar.height),
      reserved: Math.round(native.width),
      controlsRight: Math.round(controls.right),
      customizeLeft: Math.round(customize.left),
      customizeRight: Math.round(customize.right),
      settingsLeft: Math.round(settings.left),
      settingsRight: Math.round(settings.right),
      settingsWidth: Math.round(settings.width),
      settingsBorderLeft: borders.borderLeftWidth,
      settingsBorderRight: borders.borderRightWidth,
      titlebarColor: getComputedStyle(document.querySelector('.titlebar')).backgroundColor,
      customizeColor: getComputedStyle(document.querySelector('.titlebar-customize-trigger')).backgroundColor,
      settingsColor: borders.backgroundColor,
      activeTabColor: document.querySelector('.tab.active')
        ? getComputedStyle(document.querySelector('.tab.active')).backgroundColor : null,
      reservedLeft: Math.round(native.left),
      brandText: document.querySelector('.brand').textContent.trim(),
      baseFont: getComputedStyle(document.documentElement).fontSize,
    };
  });
  assert.equal(rect.height, 42, 'Title bar must remain 42px high');
  assert.equal(rect.titlebarColor, 'rgb(23, 23, 23)', 'Title bar must use #171717');
  assert.equal(rect.customizeColor, 'rgb(23, 23, 23)', 'Customize slot must match title bar');
  assert.equal(rect.settingsColor, 'rgb(23, 23, 23)', 'Settings slot must match title bar');
  if (rect.activeTabColor !== null) {
    assert.equal(rect.activeTabColor, 'rgb(10, 10, 10)', 'Active tab must use #0A0A0A');
  }
  assert.equal(rect.reserved, 140, 'Windows caption reservation must remain 140px');
  assert.equal(rect.settingsWidth, 42, 'Settings is an independent 42px slot');
  assert.equal(rect.settingsRight, rect.reservedLeft,
    'Settings must touch the Windows caption-control reservation');
  assert.equal(rect.controlsRight, rect.customizeLeft,
    'Pinned commands must end before the customize slot');
  assert.equal(rect.customizeRight, rect.settingsLeft,
    'Customize must sit immediately before app settings');
  assert.equal(rect.settingsBorderLeft, '1px');
  assert.equal(rect.settingsBorderRight, '1px');
  assert.equal(rect.brandText, 'T', 'Only the brand icon belongs in the title bar');
  assert.equal(rect.baseFont, '14px', 'App typography must use the 14px base');
  log('Title bar geometry: ' + JSON.stringify(rect));
}

async function registerSample(page, projectName, rootPath) {
  await page.locator('.tabs .title-action').click();
  await page.locator('#project-name').fill(projectName);
  await page.locator('#project-path').fill(rootPath);
  await page.locator('.project-dialog .dialog-actions .primary').click();
  await page.locator('.tab.active').filter({ hasText: projectName })
    .waitFor({ state: 'visible' });
}

async function importSample(application, page, filename) {
  const pathToFixture = path.join(fixtures, filename);
  // Replace only the file-picker implementation inside this isolated test
  // process. The renderer still calls its normal import action and SQLite IPC.
  await application.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false, filePaths: [filePath],
    });
  }, pathToFixture);
  await page.locator('.navigator-controls button')
    .filter({ hasText: 'Import JSON/JSONL' }).click();
  await page.waitForFunction(() =>
    document.querySelectorAll('.ticket-card').length === 16,
  );
  const records = await page.evaluate(async () => {
    const projects = await window.ticketsEditor.listProjects();
    const activeTab = document.querySelector('.tab.active').textContent.trim();
    const project = projects.find(item => activeTab.includes(item.name));
    return project ? window.ticketsEditor.listTickets(project.projectUuid) : [];
  });
  assert.equal(records.length, 16, filename + ' did not import 16 tickets');
  assert.ok(records.every(item => item.validation.valid),
    filename + ' contains invalid tickets');
  log(filename + ': imported 16 valid tickets');
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
    assert.equal(await page.locator('.subbar').count(), 0, 'Workspace subbar must be absent');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByRole('tab', { name: 'Application' }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#app-theme').inputValue(), 'dark');
    await page.locator('#app-theme').selectOption('light');
    assert.equal(await page.locator('html[data-theme="light"]').count(), 1);
    const lightTitlebar = await page.locator('.titlebar').evaluate(
      element => getComputedStyle(element).backgroundColor,
    );
    assert.equal(lightTitlebar, 'rgb(243, 244, 246)');
    await page.locator('#app-theme').selectOption('dark');
    assert.equal(await page.locator('html[data-theme="dark"]').count(), 1);
    assert.equal(await page.getByRole('tab', { name: 'Project' }).isDisabled(), true);
    await page.locator('#interface-density').selectOption('compact');
    assert.equal(await page.locator('.app.compact').count(), 1);
    await page.getByRole('button', { name: 'Close settings' }).click();
    assert.equal(await page.locator('.title-pinned-action').count(), 5);
    await screenshot(application, page, '01-default-titlebar');

    await registerSample(page, 'A — JSONL Tickets', project);
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.getByRole('tab', { name: 'Project' }).click();
    assert.equal(await page.locator('#project-name').inputValue(), 'A — JSONL Tickets');
    await page.getByRole('button', { name: 'Close settings' }).click();
    await importSample(application, page, 'sample-tickets.jsonl');
    await screenshot(application, page, '02-jsonl-populated');

    const nestedProject = path.join(temp, 'NestedProject');
    fs.mkdirSync(nestedProject, { recursive: true });
    await registerSample(page, 'B — Nested JSON Tickets', nestedProject);
    await importSample(application, page, 'nested-tickets.json');
    const nestedProjectRecord = await page.evaluate(async () => {
      return (await window.ticketsEditor.listProjects())
        .find(item => item.name === 'B — Nested JSON Tickets');
    });
    const nestedDoc = await page.evaluate(
      id => window.ticketsEditor.getProjectDocument(id),
      nestedProjectRecord.projectUuid,
    );
    assert.equal(nestedDoc.sourceFormat, 'json');
    assert.equal(nestedDoc.document.project.milestones.length, 3);
    await screenshot(application, page, '03-nested-json-populated');

    // Use an existing fixture ticket for an actual editor save interaction.
    await page.locator('#ticket-task').fill('Verify the native Windows title bar');
    await page.locator('.title-pinned-action[aria-label="Save ticket"]').click();
    await page.locator('.unsaved').waitFor({ state: 'detached' });
    await screenshot(application, page, '04-edited-nested-ticket');

    await page.getByRole('button', { name: 'Customize title-bar commands' }).click();
    await page.locator('.titlebar-customizer').waitFor({ state: 'visible' });
    await screenshot(application, page, '05-customizer');
    await page.locator('.titlebar-customize-search').fill('Format ticket JSON');
    await page.getByRole('button', { name: 'Pin Format ticket JSON' }).click();
    await page.locator('.title-pinned-action[aria-label="Format ticket JSON"]')
      .waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Move Format ticket JSON left' }).click();
    await page.getByRole('button', { name: 'Close title-bar customization' }).click();
    assert.equal(await page.locator('.title-pinned-action').count(), 6);
    await screenshot(application, page, '06-customized-titlebar');

    // Load a dense preference to check horizontal overflow and safe caption space.
    await page.evaluate(({ key, pins }) => {
      localStorage.setItem(key, JSON.stringify(pins));
    }, { key: pinStorageKey, pins: densePins });
    await page.reload();
    await page.locator('.title-pinned-action').first().waitFor();
    assert.equal(await page.locator('.title-pinned-action').count(), densePins.length);
    await checkGeometry(page);
    await screenshot(application, page, '07-fifteen-pinned-commands');

    await page.keyboard.press('Control+Shift+P');
    await page.locator('.command-palette').waitFor({ state: 'visible' });
    await screenshot(application, page, '08-command-palette');
    await page.keyboard.press('Escape');
    await page.locator('.command-palette').waitFor({ state: 'detached' });

    // Persist light mode across an actual app restart with a populated JSON editor.
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.locator('#app-theme').selectOption('light');
    await page.getByRole('button', { name: 'Close settings' }).click();
    assert.equal(await page.locator('.cm-editor').count(), 1);
    assert.equal(await page.locator('.cm-editor').evaluate(
      element => getComputedStyle(element).backgroundColor,
    ), 'rgb(255, 255, 255)');

    await application.close();
    session = null;
    session = await launch(appData);
    ({ application, page } = session);
    await page.locator('.title-pinned-action').first().waitFor();
    assert.equal(await page.locator('.title-pinned-action').count(), densePins.length);
    await checkGeometry(page);
    assert.equal(await page.locator('.ticket-card').count(), 16,
      'Populated ticket navigator must survive an app restart');
    assert.equal(await page.locator('html[data-theme="light"]').count(), 1,
      'Light preference must survive an app restart');
    assert.equal(await page.locator('.cm-editor').evaluate(
      element => getComputedStyle(element).backgroundColor,
    ), 'rgb(255, 255, 255)');
    await screenshot(application, page, '09-after-restart');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await page.locator('#app-theme').selectOption('dark');
    await page.getByRole('button', { name: 'Close settings' }).click();
    await checkGeometry(page);
    log('PASS: WinApp CLI HWND captures, icon-only title bar, readable typography, JSONL + nested JSON fixtures');
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
