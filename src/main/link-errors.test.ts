import { describe, expect, it } from 'vitest';
import { linkOperationError } from './link-errors';

function withCode(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error('OS error'), { code });
}

describe('cross-platform file-link errors', () => {
  it('explains cross-filesystem hardlink errors on any OS', () => {
    for (const platform of ['win32', 'darwin', 'linux']) {
      const error = linkOperationError('hardlink', withCode('EXDEV'), platform) as Error;
      expect(error.message).toContain('same filesystem');
      expect(error.message).toContain('symbolic link');
    }
  });

  it('uses Windows guidance only for Windows symbolic-link permission errors', () => {
    expect((linkOperationError('symlink', withCode('EPERM'), 'win32') as Error).message)
      .toContain('Developer Mode');
    for (const platform of ['darwin', 'linux']) {
      const error = linkOperationError('symlink', withCode('EACCES'), platform) as Error;
      expect(error.message).toContain('project directory');
      expect(error.message).not.toContain('Developer Mode');
    }
  });

  it('reports read-only filesystems without Windows assumptions', () => {
    expect((linkOperationError('symlink', withCode('EROFS'), 'darwin') as Error).message)
      .toContain('read-only filesystem');
  });

  it('reports concurrent creation instead of overwriting the file', () => {
    expect((linkOperationError('symlink', withCode('EEXIST'), 'linux') as Error).message)
      .toContain('already exists');
  });

  it('preserves unknown errors for diagnostics', () => {
    const original = withCode('ENOSPC');
    expect(linkOperationError('hardlink', original, 'linux')).toBe(original);
  });
});
