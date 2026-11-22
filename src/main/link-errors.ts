import type { LinkMode } from '../shared/contracts';

/**
 * Translate known OS errors into instructions. Preserve other errors and
 * their error codes to make troubleshooting possible on all host systems.
 */
export function linkOperationError(
  mode: LinkMode,
  error: unknown,
  platform = process.platform,
): unknown {
  const code = (error as NodeJS.ErrnoException | null)?.code;

  if (code === 'EEXIST') {
    return new Error(
      'The .tickets path already exists. Inspect that file before setting up a link.',
      { cause: error },
    );
  }

  if (mode === 'hardlink' && code === 'EXDEV') {
    return new Error(
      'Hardlinks require the project and application data to be on the same filesystem. Use a symbolic link.',
      { cause: error },
    );
  }

  if (mode === 'symlink' && (code === 'EPERM' || code === 'EACCES')) {
    return new Error(
      platform === 'win32'
        ? 'Windows denied symbolic link creation. Enable Developer Mode or use an account with symbolic-link privileges.'
        : 'The operating system denied symbolic link creation. Check permissions on the project directory.',
      { cause: error },
    );
  }

  if (mode === 'hardlink' && (code === 'EPERM' || code === 'EACCES')) {
    return new Error(
      'The filesystem denied hardlink creation. Check directory permissions and filesystem support.',
      { cause: error },
    );
  }

  if (code === 'EROFS') {
    return new Error(
      'The project directory is on a read-only filesystem. Choose a writable location.',
      { cause: error },
    );
  }

  return error;
}
