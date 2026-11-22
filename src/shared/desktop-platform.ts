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
  titleBarStyle: 'hidden' | 'default';
  titleBarOverlay?: {
    color: string;
    symbolColor: string;
    height: number;
  };
}

export function windowChrome(platform: string): WindowChrome {
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#20242a',
        symbolColor: '#f3f4f6',
        height: 42,
      },
    };
  }

  // macOS and Linux keep their native window decorations.
  return { titleBarStyle: 'default' };
}

export function nativeApplicationMenu(platform: string): boolean {
  return platform === 'darwin';
}

export function shortcutPrefix(platform: string): string {
  return platform === 'darwin' ? '⌘' : 'Ctrl+';
}
