import { describe, expect, it, vi } from 'vitest';
import { commandIds, createCommands, runCommand } from './commands';
import type { CommandContext, CommandHandlers } from './commands';
import {
  customizableCommands,
  DEFAULT_TITLEBAR_PINS,
  isPinnableCommandId,
  loadTitlebarPins,
  normalizeTitlebarPins,
  pinCommand,
  pinnedTitlebarCommands,
  PIN_STORAGE_KEY,
  reorderPinnedCommands,
  saveTitlebarPins,
  shiftPinnedCommand,
  unpinCommand,
} from './titlebar-pins';

const context: CommandContext = {
  hasProject: true,
  hasTicket: true,
  dirty: false,
  invalidJson: false,
  busy: false,
  selectionCount: 1,
  revisionCount: 1,
};

function commands() {
  const handler = vi.fn();
  const handlers = {} as CommandHandlers;
  for (const id of commandIds) handlers[id] = handler;
  return { entries: createCommands(context, handlers), handler };
}

describe('title bar command preferences', () => {
  it('starts with the existing five title-bar actions in their original order', () => {
    expect(loadTitlebarPins({ getItem: () => null })).toEqual([
      'project.search', 'palette.open', 'ticket.save', 'project.import', 'ticket.new',
    ]);
    expect(DEFAULT_TITLEBAR_PINS).toHaveLength(5);
  });

  it('rejects missing command IDs and duplicate preferences', () => {
    expect(normalizeTitlebarPins([
      'ticket.new', 'project.switch:one', 'ticket.new', null, 'unknown', 'ticket.save',
    ])).toEqual(['ticket.new', 'ticket.save']);
    expect(isPinnableCommandId('project.switch:one')).toBe(false);
    expect(isPinnableCommandId('titlebar.customize')).toBe(false);
    expect(isPinnableCommandId('project.copy')).toBe(true);
  });

  it('supports an intentionally empty title bar without resetting it', () => {
    expect(normalizeTitlebarPins([])).toEqual([]);
    expect(loadTitlebarPins({ getItem: () => '[]' })).toEqual([]);
  });

  it('loads defaults for malformed or inaccessible saved settings', () => {
    expect(loadTitlebarPins({ getItem: () => '{broken' })).toEqual(DEFAULT_TITLEBAR_PINS);
    expect(loadTitlebarPins({ getItem: () => '"not an array"' })).toEqual(
      DEFAULT_TITLEBAR_PINS,
    );
    expect(loadTitlebarPins({
      getItem: () => { throw new Error('storage unavailable'); },
    })).toEqual(DEFAULT_TITLEBAR_PINS);
  });

  it('adds and removes pins without duplicates', () => {
    const starting = ['ticket.new'] as const;
    expect(pinCommand(starting, 'ticket.new')).toEqual(['ticket.new']);
    expect(pinCommand(starting, 'project.export')).toEqual([
      'ticket.new', 'project.export',
    ]);
    expect(unpinCommand(starting, 'ticket.new')).toEqual([]);
  });

  it('moves pins left and right, including boundaries', () => {
    const pins = ['ticket.new', 'ticket.save', 'project.import'] as const;
    expect(shiftPinnedCommand(pins, 'project.import', -1)).toEqual([
      'ticket.new', 'project.import', 'ticket.save',
    ]);
    expect(shiftPinnedCommand(pins, 'ticket.new', 1)).toEqual([
      'ticket.save', 'ticket.new', 'project.import',
    ]);
    expect(shiftPinnedCommand(pins, 'ticket.new', -1)).toEqual(pins);
    expect(shiftPinnedCommand(pins, 'ticket.delete', 1)).toEqual(pins);
    expect(pins).toEqual(['ticket.new', 'ticket.save', 'project.import']);
  });

  it('reorders by drop position without losing commands', () => {
    const pins = ['ticket.new', 'ticket.save', 'project.import'] as const;
    expect(reorderPinnedCommands(pins, 'project.import', 'ticket.new')).toEqual([
      'project.import', 'ticket.new', 'ticket.save',
    ]);
    expect(reorderPinnedCommands(pins, 'ticket.new', 'project.import')).toEqual([
      'ticket.save', 'ticket.new', 'project.import',
    ]);
    expect(reorderPinnedCommands(pins, 'ticket.new', 'ticket.new')).toEqual(pins);
    expect(reorderPinnedCommands(pins, 'ticket.delete', 'ticket.save')).toEqual(pins);
  });

  it('round-trips a custom preference through storage', () => {
    let stored: string | null = null;
    const storage = {
      getItem: (key: string) => key === PIN_STORAGE_KEY ? stored : null,
      setItem: (key: string, value: string) => {
        expect(key).toBe(PIN_STORAGE_KEY);
        stored = value;
      },
    };
    expect(saveTitlebarPins(storage, ['ticket.format', 'project.copy'])).toBe(true);
    expect(loadTitlebarPins(storage)).toEqual(['ticket.format', 'project.copy']);
    expect(saveTitlebarPins({
      setItem: () => { throw new Error('blocked'); },
    }, [])).toBe(false);
  });

  it('runs pinned commands through the existing registry and honors disabled states', () => {
    const { entries, handler } = commands();
    const actions = pinnedTitlebarCommands(['ticket.save', 'ticket.new'], entries);
    expect(actions.map((action) => action.id)).toEqual(['ticket.save', 'ticket.new']);
    expect(actions[0].enabled).toBe(false);
    expect(runCommand(entries, actions[0].id)).toBe(false);
    expect(runCommand(entries, actions[1].id)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('filters the customization list and puts currently pinned commands first', () => {
    const { entries } = commands();
    const items = customizableCommands(entries, ['ticket.new', 'project.import'], '');
    expect(items.slice(0, 2).map((command) => command.id)).toEqual([
      'ticket.new', 'project.import',
    ]);
    expect(customizableCommands(entries, [], 'revisions').some(
      (command) => command.id === 'project.settings',
    )).toBe(true);
    expect(customizableCommands(entries, [], 'not-a-command')).toEqual([]);
  });

  it('does not offer ephemeral project-switch commands for pinning', () => {
    const { entries } = commands();
    const extra = {
      ...entries[0],
      id: 'project.switch:one' as const,
      title: 'Switch to Project One',
    };
    expect(customizableCommands([...entries, extra], [], 'project one')).toEqual([]);
  });
});
