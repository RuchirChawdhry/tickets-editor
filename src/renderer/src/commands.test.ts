import { describe, expect, it, vi } from 'vitest';
import {
  commandForShortcut,
  formatShortcut,
  commandIds,
  createCommands,
  nextEnabledIndex,
  runCommand,
  searchCommands,
} from './commands';
import type { CommandContext, CommandHandlers } from './commands';

const empty: CommandContext = {
  hasProject: false,
  hasTicket: false,
  dirty: false,
  invalidJson: false,
  busy: false,
  selectionCount: 0,
  revisionCount: 0,
};

function setup(context: Partial<CommandContext> = {}) {
  const spy = vi.fn();
  const handlers = Object.fromEntries(commandIds.map((id) => [id, spy])) as CommandHandlers;
  return { commands: createCommands({ ...empty, ...context }, handlers), spy };
}

describe('shared command registry', () => {
  it('has one unique handler per command ID', () => {
    expect(new Set(commandIds).size).toBe(commandIds.length);
    expect(setup().commands.map((command) => command.id)).toEqual(commandIds);
  });

  it('disables project actions without a registered project', () => {
    const { commands, spy } = setup();
    expect(commands.find((command) => command.id === 'ticket.new')?.enabled).toBe(false);
    expect(runCommand(commands, 'ticket.new')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(runCommand(commands, 'project.register')).toBe(true);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('disables saves with no changes or invalid JSON', () => {
    for (const state of [{ dirty: false }, { dirty: true, invalidJson: true }]) {
      const { commands } = setup({ hasProject: true, hasTicket: true, ...state });
      expect(commands.find((command) => command.id === 'ticket.save')?.enabled).toBe(false);
    }
  });

  it('allows a valid dirty ticket to save and blocks actions while busy', () => {
    const active = setup({ hasProject: true, hasTicket: true, dirty: true });
    expect(runCommand(active.commands, 'ticket.save')).toBe(true);
    expect(active.spy).toHaveBeenCalledOnce();

    const busy = setup({ hasProject: true, hasTicket: true, dirty: true, busy: true });
    expect(runCommand(busy.commands, 'ticket.save')).toBe(false);
    expect(busy.spy).not.toHaveBeenCalled();
  });

  it('enables batch commands only for a selection', () => {
    const noSelection = setup({ hasProject: true });
    const selected = setup({ hasProject: true, selectionCount: 2 });
    expect(runCommand(noSelection.commands, 'ticket.duplicate')).toBe(false);
    expect(runCommand(selected.commands, 'ticket.duplicate')).toBe(true);
  });

  it('supports a revision command only if a revision exists', () => {
    const missing = setup({ hasProject: true, revisionCount: 0 });
    const found = setup({ hasProject: true, revisionCount: 1 });
    expect(runCommand(missing.commands, 'project.compareRevision')).toBe(false);
    expect(runCommand(found.commands, 'project.compareRevision')).toBe(true);
  });

  it('searches command titles and alternate keywords', () => {
    const commands = setup({ hasProject: true, hasTicket: true }).commands;
    expect(searchCommands(commands, 'duplicate')[0]?.id).toBe('ticket.duplicate');
    expect(searchCommands(commands, 'bulk')[0]?.id).toBe('ticket.batchEdit');
    expect(searchCommands(commands, 'save ticket')[0]?.id).toBe('ticket.save');
    expect(searchCommands(commands, 'unmatched-string')).toEqual([]);
  });

  it('sorts enabled commands before unavailable commands', () => {
    const commands = setup({ hasProject: false }).commands;
    const results = searchCommands(commands, 'project');
    expect(results[0]?.enabled).toBe(true);
    expect(results.at(-1)?.enabled).toBe(false);
  });

  it('supports Ctrl and Cmd without depending on platform detection', () => {
    const commands = setup({ hasProject: true }).commands;
    const key = { key: 'k', shiftKey: false, altKey: false, ctrlKey: true, metaKey: false };
    expect(commandForShortcut(commands, key)?.id).toBe('project.search');
    expect(commandForShortcut(commands, { ...key, ctrlKey: false, metaKey: true })?.id)
      .toBe('project.search');
    expect(commandForShortcut(commands, { ...key, key: 'f' })?.id).toBe('project.search');
    expect(formatShortcut('Mod+Shift+P')).toBe('Ctrl/⌘+Shift+P');
  });

  it('requires exact modifiers for the palette shortcut', () => {
    const commands = setup().commands;
    const event = { key: 'P', shiftKey: true, altKey: false, ctrlKey: true, metaKey: false };
    expect(commandForShortcut(commands, event)?.id).toBe('palette.open');
    expect(commandForShortcut(commands, { ...event, shiftKey: false })).toBeUndefined();
    expect(commandForShortcut(commands, { ...event, altKey: true })).toBeUndefined();
    expect(commandForShortcut(commands, { ...event, metaKey: true })).toBeUndefined();
  });

  it('cycles through enabled palette options', () => {
    const commands = setup().commands;
    const firstEnabled = commands.findIndex((command) => command.enabled);
    expect(nextEnabledIndex(commands, firstEnabled, 1)).not.toBe(-1);
    expect(nextEnabledIndex([], 0, 1)).toBe(-1);
    expect(nextEnabledIndex(commands.filter((command) => !command.enabled), 0, 1)).toBe(-1);
  });
});
