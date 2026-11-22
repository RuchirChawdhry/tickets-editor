import { describe, expect, it } from 'vitest';
import {
  desktopPlatform,
  nativeApplicationMenu,
  shortcutPrefix,
  windowChrome,
} from './desktop-platform';

describe('desktop platform behavior', () => {
  it('uses native title bars outside Windows', () => {
    for (const platform of ['darwin', 'linux', 'freebsd']) {
      expect(windowChrome(platform)).toEqual({ titleBarStyle: 'default' });
    }
  });

  it('uses the Windows window-controls overlay only on Windows', () => {
    expect(windowChrome('win32')).toEqual({
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#20242a',
        symbolColor: '#f3f4f6',
        height: 42,
      },
    });
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
