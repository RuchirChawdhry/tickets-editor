import { describe, expect, it } from 'vitest';
import {
  desktopPlatform,
  nativeApplicationMenu,
  shortcutPrefix,
  windowChrome,
} from './desktop-platform';

describe('desktop platform behavior', () => {
  it('uses the integrated title bar on macOS without overlay controls', () => {
    expect(windowChrome('darwin')).toEqual({ titleBarStyle: 'hidden' });
  });

  it('shows native overlay controls on Windows and Linux', () => {
    for (const platform of ['win32', 'linux', 'freebsd']) {
      expect(windowChrome(platform)).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#20242a',
        symbolColor: '#f3f4f6',
        height: 42,
      },
    });
    }
  });

  it('preserves the native macOS application menu', () => {
    expect(nativeApplicationMenu('darwin')).toBe(true);
    expect(nativeApplicationMenu('linux')).toBe(false);
    expect(nativeApplicationMenu('win32')).toBe(false);
  });

  it('uses the platform keyboard modifier in help text', () => {
    expect(shortcutPrefix('darwin')).toBe('⌘');
    expect(shortcutPrefix('win32')).toBe('Ctrl+');
    expect(shortcutPrefix('linux')).toBe('Ctrl+');
  });

  it('maps unknown platforms without treating them as Windows', () => {
    expect(desktopPlatform('freebsd')).toBe('other');
    expect(desktopPlatform('darwin')).toBe('darwin');
    expect(desktopPlatform('linux')).toBe('linux');
    expect(desktopPlatform('win32')).toBe('win32');
  });
});
