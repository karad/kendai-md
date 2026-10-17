import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  cp,
  access,
  readdir,
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
  const packagedRoots = new Set([
    'LICENSE',
    'README.md',
    'dist',
    'doc',
    'package.json',
    'node_modules',
  ]);
  for (const entry of await readdir(installedRoot))
    assert.ok(
      packagedRoots.has(entry),
      `Unexpected packaged source or metadata: ${entry}`,
    );
  for (const directory of ['dist', 'doc']) {
    for (const entry of await readdir(path.join(installedRoot, directory), {
      recursive: true,
    })) {
      assert.ok(
        !/\.test\.[cm]?[jt]sx?$/.test(entry),
        `Test leaked into package: ${entry}`,
      );
    }
  }
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
  assert.match(help, /--tui/);
  for (const file of [
    'tui/app.js',
    'tui/run.js',
    'tui/model.js',
    'tui/text.js',
    'tui/markdown.js',
    'tui/table.js',
    'tui/navigation.js',
    'tui/session.js',
    'tui/watch.js',
    'tui/images.js',
  ]) {
    await access(path.join(installedRoot, 'dist', file));
  }
  const { renderTerminalMarkdown } = await import(
    pathToFileURL(path.join(installedRoot, 'dist/tui/markdown.js')).href
  );
  const terminalMarkdown = renderTerminalMarkdown(
    '# Heading\n\n[Guide](./doc/intro.md)',
    54,
  );
  assert.deepEqual(
    terminalMarkdown.targets.map((target) => target.kind),
    ['heading', 'link'],
  );
  assert.ok(
    terminalMarkdown.lines.some((line) => line.spans.some((span) => span.bold)),
  );
  const { Session } = await import(
    pathToFileURL(path.join(installedRoot, 'dist/tui/session.js')).href
  );
  const { Library } = await import(
    pathToFileURL(path.join(installedRoot, 'dist/library.js')).href
  );
  const session = new Session(await Library.create(['.'], project));
  const home = session
    .snapshot()
    .entries.find((entry) => entry.name === 'README.md');
  await session.open(home.id);
  await session.follow('doc/intro.md#project-introduction');
  assert.equal(session.snapshot().state.document.entry.name, 'intro.md');
  await session.back();
  assert.equal(session.snapshot().state.document.entry.id, home.id);
  await session.forward();
  assert.equal(session.snapshot().state.document.entry.name, 'intro.md');
  session.beginSearch();
  session.editSearch('introduction');
  session.commitSearch();
  assert.equal(session.snapshot().matches.length, 1);
  session.dispose();
  const imageLayout = renderTerminalMarkdown(
    '![Workflow](./assets/workflow.svg)',
    54,
  );
  assert.equal(imageLayout.targets[0].kind, 'image');
  const imageRoot = path.join(installedRoot, 'doc');
  const imageLibrary = await Library.create(['.'], imageRoot);
  const openedImages = [];
  const images = new Session(imageLibrary, async (file) => {
    openedImages.push(file);
  });
  const imageDocument = imageLibrary
    .snapshot()
    .documents.find((entry) => entry.name === 'tui-sample.md');
  await images.open(imageDocument.id);
  const imageTarget = images
    .snapshot()
    .layout.targets.find((target) => target.kind === 'image');
  while (images.snapshot().state.activeTarget !== imageTarget.id)
    images.send({ type: 'tab' });
  await images.activate();
  assert.equal(openedImages.length, 1);
  assert.equal(path.basename(openedImages[0]), 'workflow.svg');
  images.dispose();
  const table = renderTerminalMarkdown(
    '| Name | Value |\n|---|---:|\n| 日本語 | 42 |',
    54,
  );
  assert.ok(table.lines.some((line) => line.tableWidth > 0));
  assert.ok(
    table.lines.some((line) =>
      line.spans.some((span) => span.text.includes('┌')),
    ),
  );
  const terminal = spawnSync(process.execPath, [cli, '--tui', '-t', 'doc/'], {
    cwd: project,
    encoding: 'utf8',
  });
  assert.equal(terminal.status, 1);
  assert.match(terminal.stderr, /requires an interactive terminal/);
  assert.equal(terminal.stdout, '');
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
        assert.match(body, /id="workspace-home"/);
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
    '\nPackage verified: global command, npm exec, Git source build, default and explicit caller-relative targets, bundled assets, rendering, TUI help/non-interactive rejection, and clean shutdown.',
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await exited;
  }
  await rm(temporary, { recursive: true, force: true });
}
