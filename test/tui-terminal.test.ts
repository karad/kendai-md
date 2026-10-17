import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const driver = fileURLToPath(
  new URL('./fixtures/tui-pty-driver.ts', import.meta.url),
);
for (const name of [
  'quit',
  'interrupt',
  'sigint',
  'sigterm',
  'render-error',
  'resize',
] as const) {
  test(
    `production PTY restores terminal state after ${name}`,
    {
      skip: process.platform !== 'darwin' || !process.stdin.isTTY,
      timeout: 15000,
    },
    async () => {
      const temporary = await mkdtemp(path.join(tmpdir(), 'kendai-terminal-'));
      await writeFile(path.join(temporary, 'a.md'), '# A\n\n日本語');
      await writeFile(path.join(temporary, 'b.md'), '# B');
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        TERM: 'xterm-256color',
        CI: 'false',
        NO_COLOR: '1',
      };
      delete env.FORCE_COLOR;
      const child = spawn(
        '/usr/bin/script',
        [
          '-q',
          '/dev/null',
          '/bin/sh',
          '-c',
          `stty columns 80 rows 24
before=$(stty -g)
"$@"
result=$?
after=$(stty -g)
if [ "$before" = "$after" ]; then
  echo TERMINAL_RESTORED
fi
exit "$result"`,
          'probe',
          process.execPath,
          '--import',
          'tsx',
          driver,
          name,
          temporary,
        ],
        { stdio: ['inherit', 'pipe', 'pipe'], env },
      );
      let output = '',
        pid: number | undefined,
        closed = false;
      const collect = (data: Buffer) => {
        output += data.toString();
        const match = /PTY_DRIVER_PID (\d+)/.exec(output);
        if (match) pid = Number(match[1]);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      const result = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code) => {
          closed = true;
          resolve(code);
        });
      });
      const timer = setTimeout(() => {
        if (pid) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}
        }
        child.kill('SIGKILL');
      }, 10000);
      try {
        const status = await result;
        assert.equal(status, name === 'render-error' ? 1 : 0, output);
        for (const marker of [
          'Files [active]',
          'TERMINAL_RESTORED',
          'APP_SIGNAL_HANDLERS_REMOVED',
          'DRIVER_COMPLETE',
          '\u001b[?1049h',
          '\u001b[?1049l',
          '\u001b[?25h',
        ])
          assert.ok(output.includes(marker), `${marker}\n${output}`);
        if (name === 'render-error')
          assert.ok(output.includes('Intentional PTY render failure'), output);
        if (name === 'resize') {
          const small = output.indexOf('Minimum size: 80x24');
          assert.ok(small >= 0, output);
          assert.ok(output.lastIndexOf('Files [active]') > small, output);
        }
      } finally {
        clearTimeout(timer);
        if (!closed) {
          if (pid) {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {}
          }
          child.kill('SIGKILL');
        }
        await rm(temporary, { recursive: true, force: true });
      }
    },
  );
}
