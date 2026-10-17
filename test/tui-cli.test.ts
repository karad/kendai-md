import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const run = (args: string[]) =>
  spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
    encoding: 'utf8',
    timeout: 10000,
  });
test('tui help and version work without a TTY and without reading invalid targets', () => {
  for (const flag of ['--help', '--version']) {
    const result = run(['--tui', '--no-open', '-t', 'missing-file', flag]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.length > 0);
    assert.ok(!result.stdout.includes('\u001b[?1049h'));
  }
});
test('tui refuses non-interactive input/output without starting HTTP or browser', () => {
  const result = run(['--tui', '--no-watch']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires an interactive terminal/);
  assert.equal(result.stdout, '');
});
test('tui rejects incompatible arguments before entering terminal mode', () => {
  const result = run(['--tui', '--port', '3000']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot be combined/);
  assert.equal(result.stdout, '');
});

test('help documents that no-watch disables TUI updates', () => {
  const result = run(['-T', '--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /TUI watches selected files by default/);
});

test('dedicated PTY checks reject piped input instead of reporting skipped success', () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../scripts/verify-tui-terminal.mjs', import.meta.url),
      ),
    ],
    { encoding: 'utf8', timeout: 10000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /interactive terminal/);
  assert.equal(result.stdout, '');
});
