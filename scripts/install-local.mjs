import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this script with npm run install:local.');
const { name, version } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const tarball = path.join(root, `${name}-${version}.tgz`);

for (const args of [
  ['uninstall', '--global', name],
  ['pack'],
  ['install', '--global', tarball],
]) {
  console.log(`Running npm ${args.join(' ')}`);
  execFileSync(process.execPath, [npm, ...args], {
    cwd: root,
    stdio: 'inherit',
  });
}
console.log('Local installation complete. Run kendai to start the reader.');
