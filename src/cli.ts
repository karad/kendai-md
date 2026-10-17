#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import open from 'open';
import { Library } from './library.js';
import { help, parseOptions } from './options.js';
import { startServer } from './server.js';

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(help);
    return;
  }
  if (options.version) {
    const pkg = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    console.log(pkg.version);
    return;
  }
  if (options.tui && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error(
      '--tui requires an interactive terminal (stdin and stdout).',
    );
  }
  const library = await Library.create(options.targets);
  if (options.tui) {
    const { runTui } = await import('./tui/run.js');
    await runTui(library, options.watch);
    return;
  }
  const server = await startServer(library, options.port, options.watch);
  const count = library.snapshot().documents.length;
  console.log(
    `\n  kendai-md\n\n  ${server.url}\n  ${count} Markdown ${count === 1 ? 'file' : 'files'} · ${options.watch ? 'watching for changes' : 'file watching disabled'}\n\n  Press Ctrl+C to stop.\n`,
  );
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void server.close().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  if (options.open) {
    try {
      const browser = await open(server.url);
      browser.on('error', () =>
        console.error(`Could not open the browser. Visit ${server.url}`),
      );
      browser.on('exit', (code) => {
        if (code)
          console.error(`Could not open the browser. Visit ${server.url}`);
      });
    } catch {
      console.error(`Could not open the browser. Visit ${server.url}`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(
    `\nkendai: ${error instanceof Error ? error.message : String(error)}\nRun kendai --help for usage.\n`,
  );
  process.exitCode = 1;
});
