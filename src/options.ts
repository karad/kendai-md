import { parseArgs } from 'node:util';

export interface Options {
  targets: string[];
  tui: boolean;
  port: number;
  open: boolean;
  watch: boolean;
  help: boolean;
  version: boolean;
}

export const help = `kendai-md — a local home for your Markdown

Usage
  kendai [-t <path> ...] [options]

Options
  -t, --target <path>  Markdown file or directory (repeatable; default: .)
  -p, --port <number>  Local port (default: an available port)
  -T, --tui            Open the terminal Markdown reader
      --no-open        Start without opening the browser
      --no-watch       Disable automatic file change detection
  -h, --help           Show this help
  -v, --version        Show the version

Examples
  kendai
  kendai -t doc/ -t README.md -t AGENTS.md
  npx kendai-md
  npx github:karad/kendai-md

Directories are scanned recursively for .md and .markdown files.
Without -t, the current directory is scanned.
Hidden entries and node_modules, bower_components, vendor, dist, build,
coverage, venv, and __pycache__ directories are excluded from scans.
Paths are resolved from your current working directory.
TUI requires an interactive terminal and cannot use --port or --no-open.
TUI watches selected files by default; use --no-watch to disable updates.
`;

export function parseOptions(args: string[]): Options {
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      tui: { type: 'boolean', short: 'T' },
      target: { type: 'string', short: 't', multiple: true },
      port: { type: 'string', short: 'p' },
      'no-open': { type: 'boolean' },
      'no-watch': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
  const targets = values.target ?? ['.'];
  if (
    !values.help &&
    !values.version &&
    values.tui &&
    (values.port !== undefined || values['no-open'])
  ) {
    throw new Error('--tui cannot be combined with --port or --no-open.');
  }
  if (
    !values.help &&
    !values.version &&
    targets.some((target) => !target.trim())
  ) {
    throw new Error('Target paths must not be empty.');
  }
  const port = values.port === undefined ? 0 : Number(values.port);
  if (
    values.port !== undefined &&
    (!/^\d+$/.test(values.port) || port < 1 || port > 65535)
  ) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }
  return {
    targets,
    tui: !!values.tui,
    port,
    open: !values['no-open'],
    watch: !values['no-watch'],
    help: !!values.help,
    version: !!values.version,
  };
}
