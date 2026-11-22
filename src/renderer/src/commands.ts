export interface CommandContext {
  hasProject: boolean;
  hasTicket: boolean;
  dirty: boolean;
  invalidJson: boolean;
  busy: boolean;
  selectionCount: number;
  revisionCount: number;
}

export const commandIds = [
  'palette.open',
  'project.register',
  'project.settings',
  'project.search',
  'project.import',
  'project.copy',
  'project.export',
  'ticket.new',
  'ticket.save',
  'ticket.delete',
  'ticket.format',
  'ticket.undo',
  'ticket.redo',
  'ticket.copySelection',
  'ticket.exportSelection',
  'ticket.selectVisible',
  'ticket.clearSelection',
  'ticket.batchEdit',
  'ticket.duplicate',
  'ticket.moveUp',
  'ticket.moveDown',
  'ticket.deleteSelection',
  'project.compareRevision',
  'project.verifyLink',
] as const;

export type CommandId = (typeof commandIds)[number];
export type CommandHandler = () => void | Promise<void>;
export type CommandHandlers = Record<CommandId, CommandHandler>;

export interface Command {
  id: CommandId;
  title: string;
  description: string;
  group: 'Workspace' | 'Tickets' | 'Editing' | 'Selection';
  keywords: string;
  shortcut?: string;
  enabled: boolean;
  run: CommandHandler;
}

type CommandSpec = Omit<Command, 'enabled' | 'run'> & {
  available: (context: CommandContext) => boolean;
};

const always = (): boolean => true;
const project = (c: CommandContext): boolean => c.hasProject && !c.busy;
const ticket = (c: CommandContext): boolean => c.hasTicket && !c.busy;
const selection = (c: CommandContext): boolean =>
  c.hasProject && c.selectionCount > 0 && !c.busy;

const specs: CommandSpec[] = [
  {
    id: 'palette.open', title: 'Open command palette',
    description: 'Find and run an application command',
    group: 'Workspace', keywords: 'launcher commands quick actions',
    shortcut: 'Mod+Shift+P', available: always,
  },
  {
    id: 'project.register', title: 'Register project',
    description: 'Add a project directory to the library',
    group: 'Workspace', keywords: 'new add folder directory',
    available: (c) => !c.busy,
  },
  {
    id: 'project.settings', title: 'Project settings',
    description: 'Edit the project, link, and revision settings',
    group: 'Workspace', keywords: 'configure details revisions',
    available: project,
  },
  {
    id: 'project.search', title: 'Search tickets',
    description: 'Focus the ticket search field',
    group: 'Workspace', keywords: 'find filter locate',
    shortcut: 'Mod+F', available: (c) => c.hasProject,
  },
  {
    id: 'project.import', title: 'Import tickets',
    description: 'Open a JSON or JSONL file',
    group: 'Workspace', keywords: 'open load json jsonl',
    available: project,
  },
  {
    id: 'project.copy', title: 'Copy project JSON',
    description: 'Copy the entire project document',
    group: 'Workspace', keywords: 'clipboard export document',
    available: project,
  },
  {
    id: 'project.export', title: 'Export project',
    description: 'Save the entire project document to a file',
    group: 'Workspace', keywords: 'save download json jsonl',
    available: project,
  },
  {
    id: 'ticket.new', title: 'New ticket',
    description: 'Create a ticket in the active project',
    group: 'Tickets', keywords: 'add create',
    shortcut: 'Mod+Shift+N', available: project,
  },
  {
    id: 'ticket.save', title: 'Save ticket',
    description: 'Save the current ticket to SQLite',
    group: 'Tickets', keywords: 'write commit',
    shortcut: 'Mod+S',
    available: (c) => ticket(c) && c.dirty && !c.invalidJson,
  },
  {
    id: 'ticket.delete', title: 'Delete current ticket',
    description: 'Delete the open ticket after confirmation',
    group: 'Tickets', keywords: 'remove',
    available: ticket,
  },
  {
    id: 'ticket.format', title: 'Format ticket JSON',
    description: 'Pretty-print the current JSON document',
    group: 'Editing', keywords: 'indent prettify',
    available: (c) => ticket(c) && !c.invalidJson,
  },
  {
    id: 'ticket.undo', title: 'Undo ticket edit',
    description: 'Undo the last editor change',
    group: 'Editing', keywords: 'history reverse',
    available: ticket,
  },
  {
    id: 'ticket.redo', title: 'Redo ticket edit',
    description: 'Redo the last undone change',
    group: 'Editing', keywords: 'history repeat',
    available: ticket,
  },
  {
    id: 'ticket.copySelection', title: 'Copy selected tickets',
    description: 'Copy selected tickets in the chosen format',
    group: 'Selection', keywords: 'clipboard json jsonl',
    available: selection,
  },
  {
    id: 'ticket.exportSelection', title: 'Export selected tickets',
    description: 'Save selected tickets to a file',
    group: 'Selection', keywords: 'download json jsonl',
    available: selection,
  },
  {
    id: 'ticket.selectVisible', title: 'Select visible tickets',
    description: 'Select every ticket that matches the current filter',
    group: 'Selection', keywords: 'select all filter',
    available: project,
  },
  {
    id: 'ticket.clearSelection', title: 'Clear ticket selection',
    description: 'Deselect all tickets',
    group: 'Selection', keywords: 'deselect cancel',
    available: selection,
  },
  {
    id: 'ticket.batchEdit', title: 'Batch edit tickets',
    description: 'Show the batch editor for selected tickets',
    group: 'Selection', keywords: 'bulk multiple edit',
    available: selection,
  },
  {
    id: 'ticket.duplicate', title: 'Duplicate selected tickets',
    description: 'Create copies with new ticket IDs',
    group: 'Selection', keywords: 'copy clone bulk',
    available: selection,
  },
  {
    id: 'ticket.moveUp', title: 'Move selected tickets up',
    description: 'Move the selected tickets earlier in the document',
    group: 'Selection', keywords: 'reorder order',
    available: selection,
  },
  {
    id: 'ticket.moveDown', title: 'Move selected tickets down',
    description: 'Move the selected tickets later in the document',
    group: 'Selection', keywords: 'reorder order',
    available: selection,
  },
  {
    id: 'ticket.deleteSelection', title: 'Delete selected tickets',
    description: 'Delete selected tickets after confirmation',
    group: 'Selection', keywords: 'remove bulk',
    available: selection,
  },
  {
    id: 'project.compareRevision', title: 'Compare latest revision',
    description: 'Compare the latest revision with the current document',
    group: 'Workspace', keywords: 'history diff compare',
    available: (c) => project(c) && c.revisionCount > 0,
  },
  {
    id: 'project.verifyLink', title: 'Check .tickets link',
    description: 'Verify the linked project file',
    group: 'Workspace', keywords: 'sync status filesystem hardlink symlink',
    available: project,
  },
];

export function createCommands(
  context: CommandContext,
  handlers: CommandHandlers,
): Command[] {
  return specs.map(({ available, ...spec }) => ({
    ...spec,
    enabled: available(context),
    run: handlers[spec.id],
  }));
}

function relevance(command: Command, terms: string[]): number {
  const title = command.title.toLocaleLowerCase();
  const keywords = command.keywords.toLocaleLowerCase();
  const description = command.description.toLocaleLowerCase();
  let score = 0;

  for (const term of terms) {
    if (title === term) score += 100;
    else if (title.startsWith(term)) score += 60;
    else if (title.includes(term)) score += 40;
    else if (keywords.split(/\s+/u).some((word) => word.startsWith(term))) score += 24;
    else if (keywords.includes(term)) score += 12;
    else if (description.includes(term)) score += 5;
    else return -1;
  }

  return score;
}

export function searchCommands(commands: Command[], query: string): Command[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return commands
    .map((command, index) => ({
      command,
      index,
      score: relevance(command, terms),
    }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => {
      if (a.command.enabled !== b.command.enabled) {
        return a.command.enabled ? -1 : 1;
      }
      return b.score - a.score || a.index - b.index;
    })
    .map(({ command }) => command);
}

export function runCommand(commands: Command[], id: CommandId): boolean {
  const command = commands.find((item) => item.id === id);
  if (!command?.enabled) return false;
  void command.run();
  return true;
}

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function commandForShortcut(
  commands: Command[],
  event: ShortcutEvent,
  platform: string,
): Command | undefined {
  const useMeta = platform === 'darwin';
  const modifier = useMeta ? event.metaKey : event.ctrlKey;
  if (!modifier || event.altKey || (useMeta ? event.ctrlKey : event.metaKey)) return;

  return commands.find((command) => {
    if (!command.shortcut) return false;
    const parts = command.shortcut.split('+');
    const key = parts.at(-1)?.toLocaleLowerCase();
    return parts.includes('Mod') &&
      parts.includes('Shift') === event.shiftKey &&
      event.key.toLocaleLowerCase() === key;
  });
}

export function nextEnabledIndex(
  commands: Command[],
  current: number,
  direction: -1 | 1,
): number {
  if (!commands.length) return -1;
  for (let offset = 1; offset <= commands.length; offset++) {
    const index = (current + direction * offset + commands.length * 2) % commands.length;
    if (commands[index].enabled) return index;
  }
  return -1;
}
