import { commandIds } from './commands';
import type { Command, StaticCommandId } from './commands';

/** Order is persisted for the Electron user profile, not per project. */
export const PIN_STORAGE_KEY = 'tickets-editor.titlebar.pins.v1';

export const DEFAULT_TITLEBAR_PINS: readonly StaticCommandId[] = [
  'project.search',
  'palette.open',
  'ticket.save',
  'project.import',
  'ticket.new',
];

const knownIds: ReadonlySet<string> = new Set(commandIds);
const toolbarOnlyIds: ReadonlySet<string> = new Set(['titlebar.customize']);

export function isPinnableCommandId(id: unknown): id is StaticCommandId {
  return typeof id === 'string' && knownIds.has(id) && !toolbarOnlyIds.has(id);
}

export function normalizeTitlebarPins(value: unknown): StaticCommandId[] {
  if (!Array.isArray(value)) return [...DEFAULT_TITLEBAR_PINS];
  const seen = new Set<StaticCommandId>();
  const result: StaticCommandId[] = [];

  for (const item of value) {
    if (!isPinnableCommandId(item) || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }

  return result;
}

export interface PinStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadTitlebarPins(storage: Pick<PinStorage, 'getItem'>): StaticCommandId[] {
  try {
    const value = storage.getItem(PIN_STORAGE_KEY);
    return value === null ? [...DEFAULT_TITLEBAR_PINS] : normalizeTitlebarPins(JSON.parse(value));
  } catch {
    return [...DEFAULT_TITLEBAR_PINS];
  }
}

export function saveTitlebarPins(
  storage: Pick<PinStorage, 'setItem'>,
  pins: readonly StaticCommandId[],
): boolean {
  try {
    storage.setItem(PIN_STORAGE_KEY, JSON.stringify(normalizeTitlebarPins(pins)));
    return true;
  } catch {
    return false;
  }
}

export function pinCommand(
  pins: readonly StaticCommandId[],
  id: StaticCommandId,
): StaticCommandId[] {
  return pins.includes(id) ? [...pins] : [...pins, id];
}

export function unpinCommand(
  pins: readonly StaticCommandId[],
  id: StaticCommandId,
): StaticCommandId[] {
  return pins.filter((item) => item !== id);
}

/** Move one place left or right. Invalid moves leave the list unchanged. */
export function shiftPinnedCommand(
  pins: readonly StaticCommandId[],
  id: StaticCommandId,
  direction: -1 | 1,
): StaticCommandId[] {
  const from = pins.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= pins.length) return [...pins];

  const next = [...pins];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Drop a dragged command immediately before the target command. */
export function reorderPinnedCommands(
  pins: readonly StaticCommandId[],
  moving: StaticCommandId,
  before: StaticCommandId,
): StaticCommandId[] {
  if (moving === before || !pins.includes(moving) || !pins.includes(before)) {
    return [...pins];
  }

  const next = pins.filter((id) => id !== moving);
  next.splice(next.indexOf(before), 0, moving);
  return next;
}

export function pinnedTitlebarCommands(
  pins: readonly StaticCommandId[],
  commands: readonly Command[],
): Command[] {
  const byId = new Map(commands.map((command) => [command.id, command]));
  return pins.flatMap((id) => {
    const command = byId.get(id);
    return command ? [command] : [];
  });
}

export function customizableCommands(
  commands: readonly Command[],
  pins: readonly StaticCommandId[],
  query: string,
): Command[] {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
  const pinIndex = new Map(pins.map((id, index) => [id, index]));
  return commands.filter((command) => {
    if (!isPinnableCommandId(command.id)) return false;
    const text = (command.title + ' ' + command.description + ' ' + command.keywords)
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => {
    const first = pinIndex.get(a.id as StaticCommandId);
    const second = pinIndex.get(b.id as StaticCommandId);
    if (first !== undefined && second !== undefined) return first - second;
    if (first !== undefined) return -1;
    if (second !== undefined) return 1;
    return a.title.localeCompare(b.title);
  });
}
