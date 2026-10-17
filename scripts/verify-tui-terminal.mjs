import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin' || !process.stdin.isTTY) {
  console.error(
    'PTY checks require macOS and an interactive terminal. See doc/tui-validation.md for other environments.',
  );
  process.exitCode = 1;
} else {
  // Direct node:test execution keeps stdin attached to the terminal; --test workers use pipes.
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      fileURLToPath(new URL('../test/tui-terminal.test.ts', import.meta.url)),
    ],
    { stdio: 'inherit' },
  );
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
