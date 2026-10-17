import { execFileSync } from 'node:child_process';
import { Library } from '../../src/library.js';
import { runTui } from '../../src/tui/run.js';

const scenario = process.argv[2] ?? 'quit';
const directory = process.argv[3];
if (!directory) throw new Error('Missing fixture directory.');
console.log(`PTY_DRIVER_PID ${process.pid}`);
const library = await Library.create(['.'], directory);
let failRender = false;
if (scenario === 'render-error') {
  const snapshot = library.snapshot.bind(library);
  library.snapshot = () => {
    const result = snapshot();
    return {
      ...result,
      documents: result.documents.map((entry) => ({
        ...entry,
        get path() {
          if (failRender) throw new Error('Intentional PTY render failure');
          return entry.path;
        },
      })),
    };
  };
}
const registered: {
  signal: 'SIGINT' | 'SIGTERM';
  handler: (...args: unknown[]) => void;
}[] = [];
// Ink keeps global cursor-restoration hooks; track the application's own callbacks.
const track = (
  event: string | symbol,
  listener: (...args: unknown[]) => void,
) => {
  if ((event === 'SIGINT' || event === 'SIGTERM') && listener.name === 'stop')
    registered.push({ signal: event, handler: listener });
};
process.on('newListener', track);
const timers: ReturnType<typeof setTimeout>[] = [];
const schedule = (delay: number, action: () => void) =>
  timers.push(setTimeout(action, delay));
let started = false;
const ready = setInterval(() => {
  if (started || !process.stdin.isRaw) return;
  started = true;
  if (scenario === 'resize') {
    for (const [delay, columns, rows] of [
      [200, 120, 40],
      [450, 60, 20],
      [700, 80, 24],
    ])
      schedule(delay!, () => {
        execFileSync(
          '/bin/stty',
          ['columns', String(columns), 'rows', String(rows)],
          { stdio: 'inherit' },
        );
        process.kill(process.pid, 'SIGWINCH');
      });
    schedule(1000, () => {
      process.stdin.push(Buffer.from('q'));
    });
  } else
    schedule(150, () => {
      if (scenario === 'sigint') process.kill(process.pid, 'SIGINT');
      else if (scenario === 'sigterm') process.kill(process.pid, 'SIGTERM');
      else if (scenario === 'render-error') {
        failRender = true;
        process.stdin.push(Buffer.from('\u001b[B'));
      } else
        process.stdin.push(
          Buffer.from(scenario === 'interrupt' ? '\u0003' : 'q'),
        );
    });
}, 25);
try {
  await runTui(library, true);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  clearInterval(ready);
  timers.forEach(clearTimeout);
  process.removeListener('newListener', track);
  if (
    registered.length === 2 &&
    registered.every(
      ({ signal, handler }) => !process.listeners(signal).includes(handler),
    )
  )
    console.log('APP_SIGNAL_HANDLERS_REMOVED');
  else {
    console.error('Application signal listener leak');
    process.exitCode = 1;
  }
  console.log('DRIVER_COMPLETE');
}
