import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await rm(new URL('../dist/', import.meta.url), {
  recursive: true,
  force: true,
});
execFileSync(
  process.execPath,
  [
    fileURLToPath(
      new URL('../node_modules/typescript/bin/tsc', import.meta.url),
    ),
  ],
  { cwd: root, stdio: 'inherit' },
);
await mkdir(new URL('../dist/web/', import.meta.url), { recursive: true });
for (const name of [
  'index.html',
  'styles.css',
  'favicon.svg',
  'kendai-mark.png',
]) {
  await copyFile(
    new URL(`../src/web/${name}`, import.meta.url),
    new URL(`../dist/web/${name}`, import.meta.url),
  );
}
await chmod(new URL('../dist/cli.js', import.meta.url), 0o755);
