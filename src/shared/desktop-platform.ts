/**
 * Keep desktop-shell differences out of the ticket editor and persistence code.
 * These functions are pure so Windows/macOS/Linux behavior can be checked on CI.
 */
export type DesktopPlatform = 'win32' | 'darwin' | 'linux' | 'other';

export function desktopPlatform(value: string): DesktopPlatform {
  if (value === 'win32' || value === 'darwin' || value === 'linux') return value;
  return 'other';
}

export interface WindowChrome {
  titleBarStyle: 'hidden';
  titleBarOverlay?: {
    color: string;
    symbolColor: string;
    height: number;
  };
}

export function windowChrome(platform: string): WindowChrome {
  // Use the same integrated renderer title bar on every desktop OS.
  // macOS keeps its traffic-light controls at the upper left.
  if (platform === 'darwin') return { titleBarStyle: 'hidden' };

  // Windows and Linux expose native window buttons over the renderer.
  // Preserve their OS-defined placement without drawing imitation controls.
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#20242a',
      symbolColor: '#f3f4f6',
      height: 42,
    },
  };
}

export function nativeApplicationMenu(platform: string): boolean {
  return platform === 'darwin';
}

export function shortcutPrefix(platform: string): string {
  return platform === 'darwin' ? '⌘' : 'Ctrl+';
}
