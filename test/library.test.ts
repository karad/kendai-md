import assert from 'node:assert/strict';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { Library, isWithin, isIgnored } from '../src/library.js';
import { fixture } from './fixtures.js';

test('mixed targets discover nested Markdown, ignore hidden and dependency files, and deduplicate overlaps', async (t) => {
  const root = await fixture(t, {
    'README.md': '# Home',
    'doc/start.MD': '# Start',
    'doc/nested/guide.markdown': '# Guide',
    'doc/image.svg': '<svg/>',
    'doc/.draft.md': '# Draft',
    'doc/.hidden/secret.md': '# Hidden',
    'doc/node_modules/package/README.md': '# Dependency',
  });
  const library = await Library.create(
    ['doc', 'README.md', 'doc/start.MD', 'doc'],
    root,
  );
  assert.deepEqual(
    library
      .snapshot()
      .documents.map((entry) => entry.path)
      .sort(),
    ['README.md', 'doc/nested/guide.markdown', 'doc/start.MD'],
  );
  assert.equal(library.snapshot().targets.length, 3);
});

test('targets are relative to the caller directory and absolute targets also work', async (t) => {
  const root = await fixture(t, { 'notes/my guide.md': '# Hello' });
  const library = await Library.create(
    [path.join(root, 'notes/my guide.md')],
    root,
  );
  const entry = library.snapshot().documents[0]!;
  assert.equal(entry.path, 'notes/my guide.md');
  assert.equal((await library.read(entry.id))?.source, '# Hello');
  assert.equal(await library.read('../../etc/passwd'), undefined);
});

test('missing targets and non-Markdown files fail with useful errors', async (t) => {
  const root = await fixture(t, { 'file.txt': 'text' });
  await assert.rejects(
    Library.create(['missing'], root),
    /Cannot read target: missing/,
  );
  await assert.rejects(
    Library.create(['file.txt'], root),
    /must be a Markdown file or directory/,
  );
});

test('empty directories are valid and refresh discovers added and removed files', async (t) => {
  const root = await fixture(t, {});
  const library = await Library.create(['.'], root);
  assert.equal(library.snapshot().documents.length, 0);
  await writeFile(path.join(root, 'first.md'), '# First');
  await library.refresh();
  const id = library.snapshot().documents[0]!.id;
  await writeFile(path.join(root, 'first.md'), '# Updated');
  await library.refresh();
  assert.equal(library.snapshot().documents[0]!.id, id);
  assert.equal((await library.read(id))?.source, '# Updated');
  await rm(path.join(root, 'first.md'));
  await library.refresh();
  assert.equal(library.snapshot().documents.length, 0);
  assert.equal(await library.read(id), undefined);
});

test('relative links resolve selected files and README directory links', async (t) => {
  const root = await fixture(t, {
    'README.md': '# Home',
    'doc/README.md': '# Docs',
    'doc/nested/guide.md': '# Guide',
    'private.md': '# Private',
  });
  const library = await Library.create(['README.md', 'doc'], root);
  const docs = library.snapshot().documents;
  const home = docs.find((entry) => entry.path === 'README.md')!;
  const guide = docs.find((entry) => entry.name === 'guide.md')!;
  const docHome = docs.find((entry) => entry.path === 'doc/README.md')!;
  assert.equal(await library.resolveDocument(home.id, 'doc/'), docHome.id);
  assert.equal(
    await library.resolveDocument(guide.id, '../../README.md'),
    home.id,
  );
  assert.equal(await library.resolveDocument(home.id, 'private.md'), undefined);
});

test('assets allow supported images under selected roots and reject traversal, hidden files, and non-images', async (t) => {
  const root = await fixture(t, {
    'doc/README.md': '# Home',
    'doc/assets/figure.svg': '<svg/>',
    'doc/.private.png': 'private',
    'doc/.hidden/picture.png': 'private',
    'doc/settings.json': '{}',
    'outside.png': 'outside',
    'doc-extra/other.png': 'outside',
  });
  const library = await Library.create(['doc'], root);
  const id = library.snapshot().documents[0]!.id;
  assert.equal(
    (await library.resolveAsset(id, 'assets/figure.svg'))?.type,
    'image/svg+xml',
  );
  for (const file of [
    '../outside.png',
    '../doc-extra/other.png',
    '.private.png',
    '.hidden/picture.png',
    'settings.json',
    'README.md',
  ]) {
    assert.equal(await library.resolveAsset(id, file), undefined, file);
  }
  assert.equal(
    await library.resolveAsset('unknown', 'assets/figure.svg'),
    undefined,
  );
});

test('explicit Markdown targets allow sibling image assets without exposing sibling Markdown', async (t) => {
  const root = await fixture(t, {
    'README.md': '# Home',
    'other.md': '# Other',
    'assets/pic.png': 'image',
  });
  const library = await Library.create(['README.md'], root);
  const id = library.snapshot().documents[0]!.id;
  assert.ok(await library.resolveAsset(id, 'assets/pic.png'));
  assert.equal(await library.resolveDocument(id, 'other.md'), undefined);
});

test('scans skip symlinks and reads reject a file replaced with a symlink', async (t) => {
  const root = await fixture(t, {
    'doc/README.md': '# Home',
    'outside/secret.md': '# Secret',
    'outside/secret.png': 'secret',
  });
  await symlink(path.join(root, 'outside'), path.join(root, 'doc/linked'));
  await symlink(
    path.join(root, 'outside/secret.md'),
    path.join(root, 'doc/link.md'),
  );
  await symlink(
    path.join(root, 'outside/secret.png'),
    path.join(root, 'doc/link.png'),
  );
  const library = await Library.create(['doc'], root);
  assert.equal(library.snapshot().documents.length, 1);
  const id = library.snapshot().documents[0]!.id;
  assert.equal(await library.resolveAsset(id, 'link.png'), undefined);
  await rm(path.join(root, 'doc/README.md'));
  await symlink(
    path.join(root, 'outside/secret.md'),
    path.join(root, 'doc/README.md'),
  );
  assert.equal(await library.read(id), undefined);
});

test('explicit symlink targets are resolved once and deduplicated', async (t) => {
  const root = await fixture(t, { 'README.md': '# Home' });
  await symlink(path.join(root, 'README.md'), path.join(root, 'alias.md'));
  const library = await Library.create(['alias.md', 'README.md'], root);
  assert.equal(library.snapshot().documents.length, 1);
});

test('deleted directories disappear without breaking other targets', async (t) => {
  const root = await fixture(t, {
    'doc/README.md': '# Docs',
    'README.md': '# Home',
  });
  const library = await Library.create(['doc', 'README.md'], root);
  await rm(path.join(root, 'doc'), { recursive: true });
  await library.refresh();
  assert.deepEqual(
    library.snapshot().documents.map((entry) => entry.path),
    ['README.md'],
  );
  await mkdir(path.join(root, 'doc'));
  await library.refresh();
});

test('containment distinguishes descendants from siblings with the same prefix', () => {
  assert.equal(isWithin('/project/doc', '/project/doc'), true);
  assert.equal(isWithin('/project/doc', '/project/doc/image.png'), true);
  assert.equal(isWithin('/project/doc', '/project/doc-extra/image.png'), false);
  assert.equal(isWithin('/project/doc', '/project/image.png'), false);
});

for (const directory of [
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'coverage',
  'venv',
  '__pycache__',
  '.git',
  '.cache',
  '.venv',
]) {
  test(`recursive discovery excludes ${directory} at every depth but allows explicit targets`, async (t) => {
    const root = await fixture(t, {
      'README.md': '# Home',
      'doc/guide.markdown': '# Guide',
      [`${directory}/README.md`]: '# Excluded',
      [`doc/${directory}/nested/README.md`]: '# Excluded',
      [`${directory}-notes/README.md`]: '# Similar name',
    });
    const library = await Library.create(['.'], root);
    const expected = ['README.md', 'doc/guide.markdown'];
    if (!directory.startsWith('.'))
      expected.push(`${directory}-notes/README.md`);
    assert.deepEqual(
      library
        .snapshot()
        .documents.map((entry) => entry.path)
        .sort(),
      expected.sort(),
    );
    const explicit = await Library.create(
      [directory, `doc/${directory}/nested/README.md`],
      root,
    );
    assert.equal(explicit.snapshot().documents.length, 2);
    const home = library
      .snapshot()
      .documents.find((entry) => entry.path === 'README.md')!;
    await writeFile(path.join(root, directory, 'image.png'), 'image');
    assert.equal(
      await library.resolveAsset(home.id, `${directory}/image.png`),
      undefined,
    );
  });
}

test('ignored paths match complete segments with either path separator', () => {
  for (const file of [
    'node_modules/a.md',
    'doc/dist/a.md',
    'doc\\build\\a.md',
    '.git/config',
    'doc/.draft.md',
  ]) {
    assert.equal(isIgnored(file), true, file);
  }
  for (const file of [
    '.',
    '..',
    './doc/guide.md',
    '../doc/guide.md',
    'doc/distribution/a.md',
    'doc/build-notes.md',
  ]) {
    assert.equal(isIgnored(file), false, file);
  }
});

test('watch selection excludes non-Markdown files and preserves directory discovery', async (t) => {
  const root = await fixture(t, {
    'README.md': '# Home',
    'src/index.ts': 'export {};',
    'doc/guide.MARKDOWN': '# Guide',
    '.private/note.md': '# Private',
    'node_modules/pkg/README.md': '# Dependency',
  });
  const library = await Library.create(['.'], root);
  const selected = (file: string, directory?: boolean) =>
    library.shouldWatch(path.join(root, file), directory);
  assert.equal(selected('.', true), true);
  assert.equal(selected('src', true), true);
  assert.equal(selected('src/index.ts', false), false);
  assert.equal(selected('doc/guide.MARKDOWN', false), true);
  assert.equal(selected('new.md', false), true);
  assert.equal(selected('folder.md', true), true);
  assert.equal(selected('src/index.ts'), true);
  assert.equal(selected('.private', true), false);
  assert.equal(selected('node_modules', true), false);
  assert.equal(selected('node_modules/pkg/README.md', false), false);
  assert.equal(selected('../outside.md', false), false);
});

test('watch selection preserves explicit excluded targets without watching sibling files', async (t) => {
  const root = await fixture(t, {
    '.private/note.md': '# Private',
    '.private/other.md': '# Other',
    'node_modules/pkg/README.md': '# Dependency',
    'node_modules/pkg/index.js': 'export {};',
  });
  const library = await Library.create(
    ['.', '.private/note.md', 'node_modules/pkg'],
    root,
  );
  assert.equal(
    library.shouldWatch(path.join(root, '.private/note.md'), false),
    true,
  );
  assert.equal(
    library.shouldWatch(path.join(root, '.private/other.md'), false),
    false,
  );
  assert.equal(
    library.shouldWatch(path.join(root, 'node_modules/pkg'), true),
    true,
  );
  assert.equal(
    library.shouldWatch(path.join(root, 'node_modules/pkg/README.md'), false),
    true,
  );
  assert.equal(
    library.shouldWatch(path.join(root, 'node_modules/pkg/index.js'), false),
    false,
  );
});
