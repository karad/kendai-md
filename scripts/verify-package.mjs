import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  cp,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run this check with npm run test:package.');
// A publish dry run must still create and install the temporary test package.
const env = { ...process.env, npm_config_dry_run: 'false' };
const temporary = await mkdtemp(path.join(tmpdir(), 'kendai-md-package-'));
let child;

try {
  execFileSync(
    process.execPath,
    [npm, 'pack', '--pack-destination', temporary],
    { cwd: root, env, stdio: 'inherit' },
  );
  const metadata = JSON.parse(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  );
  assert.equal(metadata.name, 'kendai-md');
  assert.deepEqual(metadata.bin, { kendai: 'dist/cli.js' });
  const tarball = path.join(
    temporary,
    `${metadata.name.replace(/^@/, '').replace('/', '-')}-${metadata.version}.tgz`,
  );
  const project = path.join(temporary, 'another-project');
  await mkdir(path.join(project, 'doc'), { recursive: true });
  await writeFile(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'kendai-md-package-check', private: true }),
  );
  await writeFile(
    path.join(project, 'README.md'),
    '# Another project\n\n[Intro](doc/intro.md)',
  );
  await writeFile(path.join(project, 'AGENTS.md'), '# Project guidance');
  await writeFile(path.join(project, 'doc/intro.md'), '# Project introduction');
  await writeFile(path.join(project, 'unselected.md'), '# Private');
  const globalPrefix = path.join(temporary, 'global');
  execFileSync(
    process.execPath,
    [
      npm,
      'install',
      '--global',
      '--prefix',
      globalPrefix,
      '--offline',
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    { cwd: project, env, stdio: 'inherit' },
  );
  const globalCommand = path.join(
    globalPrefix,
    process.platform === 'win32' ? 'kendai.cmd' : 'bin/kendai',
  );
  assert.equal(
    execFileSync(globalCommand, ['--version'], {
      cwd: project,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim(),
    metadata.version,
  );
  const runPackage = (spec) =>
    execFileSync(
      process.execPath,
      [
        npm,
        'exec',
        '--yes',
        '--offline',
        `--package=${spec}`,
        '--',
        'kendai',
        '--version',
      ],
      { cwd: project, env, encoding: 'utf8' },
    ).trim();
  assert.equal(runPackage(tarball), metadata.version);

  const gitSource = path.join(temporary, 'git-source');
  await mkdir(gitSource);
  for (const file of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'scripts',
    'src',
    'README.md',
    'LICENSE',
    'doc',
  ]) {
    await cp(path.join(root, file), path.join(gitSource, file), {
      recursive: true,
    });
  }
  await assert.rejects(access(path.join(gitSource, 'dist')));
  for (const args of [
    ['init', '--quiet'],
    ['add', '.'],
    [
      '-c',
      'user.name=Package Check',
      '-c',
      'user.email=package-check@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'Package fixture',
    ],
  ]) {
    execFileSync('git', args, { cwd: gitSource, stdio: 'inherit' });
  }
  assert.equal(
    runPackage(`git+${pathToFileURL(gitSource).href}`),
    metadata.version,
  );
  execFileSync(
    process.execPath,
    [
      npm,
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      tarball,
    ],
    { cwd: project, env, stdio: 'inherit' },
  );
  const version = execFileSync(
    process.execPath,
    [npm, 'exec', '--offline', '--', 'kendai', '--version'],
    { cwd: project, env, encoding: 'utf8' },
  ).trim();
  assert.equal(version, metadata.version);
  const cli = path.join(
    project,
    'node_modules',
    metadata.name,
    metadata.bin.kendai,
  );
  const installedRoot = path.join(project, 'node_modules', metadata.name);
  assert.match(
    await readFile(path.join(installedRoot, 'LICENSE'), 'utf8'),
    /MIT License/,
  );
  await access(path.join(installedRoot, 'doc/getting-started.md'));
  await assert.rejects(access(path.join(installedRoot, 'src')));
  await assert.rejects(
    access(path.join(installedRoot, 'node_modules/typescript')),
  );
  const help = execFileSync(process.execPath, [cli, '--help'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.match(help, /^kendai-md —/);
  assert.match(help, /kendai \[-t <path>/);
  for (const targets of [
    [],
    ['-t', 'doc/', '-t', 'README.md', '-t', 'AGENTS.md'],
  ]) {
    child = spawn(globalCommand, [...targets, '--no-open'], {
      cwd: project,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(
        () => reject(new Error(`CLI startup timed out: ${output}`)),
        10_000,
      );
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
        if (match) {
          clearTimeout(timeout);
          resolve(match[0]);
        }
      });
      child.stderr.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`CLI exited (${code}): ${output}`));
      });
    });
    const library = await (await fetch(`${url}/api/library`)).json();
    assert.equal(library.project, 'another-project');
    assert.deepEqual(library.documents.map((entry) => entry.path).sort(), [
      'AGENTS.md',
      'README.md',
      'doc/intro.md',
      ...(targets.length === 0 ? ['unselected.md'] : []),
    ]);
    for (const route of [
      '/',
      '/ui/client.js',
      '/ui/view-model.js',
      '/ui/styles.css',
      '/ui/favicon.svg',
      '/ui/kendai-mark.png',
    ]) {
      const response = await fetch(`${url}${route}`);
      assert.equal(response.status, 200, `Packaged asset: ${route}`);
      const body = await response.text();
      assert.ok(body.length > 0);
      if (route === '/') {
        assert.match(body, /<title>kendai-md<\/title>/);
        assert.match(body, /aria-label="kendai-md home"/);
      }
    }
    const home = library.documents.find((entry) => entry.name === 'README.md');
    const document = await (
      await fetch(`${url}/api/document?id=${home.id}`)
    ).json();
    assert.equal(document.title, 'Another project');
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const [code] = await exited;
    assert.equal(code, 0, 'CLI shuts down cleanly');
  }
  console.log(
    '\nPackage verified: global command, npm exec, Git source build, default and explicit caller-relative targets, bundled assets, rendering, and clean shutdown.',
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  await rm(temporary, { recursive: true, force: true });
}
