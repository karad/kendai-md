import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { get } from 'node:http';
import path from 'node:path';
import { test } from 'node:test';
import { Library } from '../src/library.js';
import { parseOptions } from '../src/options.js';
import { startServer } from '../src/server.js';
import type { LibrarySnapshot, RenderedDocument } from '../src/types.js';
import { fixture } from './fixtures.js';

test('HTTP serves selected documents, assets, and relative links with fixed static routes', async (t) => {
  const root = await fixture(t, {
    'README.md':
      '# Home\n\n[Guide](doc/my%20guide.md#first)\n\n![Figure](doc/figure.svg)',
    'doc/my guide.md': '# Guide\n\n## First',
    'doc/figure.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'private.md': '# Private',
    'secret.txt': 'secret',
  });
  const server = await startServer(
    await Library.create(['README.md', 'doc'], root),
  );
  t.after(() => server.close());
  const snapshot = (await (
    await fetch(`${server.url}/api/library`)
  ).json()) as LibrarySnapshot;
  const home = snapshot.documents.find((entry) => entry.name === 'README.md')!;
  const guide = snapshot.documents.find(
    (entry) => entry.name === 'my guide.md',
  )!;
  const page = await fetch(server.url);
  assert.match(await page.text(), /Rendered Markdown/);
  assert.match(
    page.headers.get('content-security-policy')!,
    /script-src 'self'/,
  );
  const document = (await (
    await fetch(`${server.url}/api/document?id=${home.id}`)
  ).json()) as RenderedDocument;
  assert.equal(document.title, 'Home');
  assert.match(document.html, /<h1 id="home">Home<\/h1>/);
  assert.ok(document.modifiedAt);
  assert.equal('source' in document, false);
  const parameters = new URLSearchParams({
    id: home.id,
    href: 'doc/my%20guide.md#first',
  });
  const resolved = (await (
    await fetch(`${server.url}/api/resolve?${parameters}`)
  ).json()) as { url: string };
  assert.equal(resolved.url, `/?doc=${guide.id}#first`);
  const redirect = await fetch(`${server.url}/link?${parameters}`, {
    redirect: 'manual',
  });
  assert.equal(redirect.status, 303);
  assert.equal(redirect.headers.get('location'), resolved.url);
  const unicodeRedirect = await fetch(
    `${server.url}/link?${new URLSearchParams({ id: home.id, href: 'doc/my%20guide.md#日本語' })}`,
    { redirect: 'manual' },
  );
  assert.equal(unicodeRedirect.status, 303);
  assert.equal(
    unicodeRedirect.headers.get('location'),
    `/?doc=${guide.id}#${encodeURIComponent('日本語')}`,
  );
  const image = await fetch(
    `${server.url}/asset?${new URLSearchParams({ id: home.id, path: 'doc/figure.svg' })}`,
  );
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/svg+xml');
  assert.match(image.headers.get('content-security-policy')!, /sandbox/);
  for (const route of [
    '/api/document?id=unknown',
    '/private.md',
    '/ui/../../secret.txt',
    '/__proto__',
    '/constructor',
    `/asset?id=${home.id}&path=secret.txt`,
  ]) {
    assert.equal((await fetch(`${server.url}${route}`)).status, 404, route);
  }
  assert.equal(
    (
      await fetch(
        `${server.url}/api/resolve?${new URLSearchParams({ id: home.id, href: 'private.md' })}`,
      )
    ).status,
    404,
  );
  for (const href of [
    'https://example.com',
    '/etc/passwd',
    '\\host\file',
    'javascript:alert(1)',
  ]) {
    assert.equal(
      (
        await fetch(
          `${server.url}/api/resolve?${new URLSearchParams({ id: home.id, href })}`,
        )
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await fetch(
        `${server.url}/api/resolve?${new URLSearchParams({ id: home.id, href: '%E0%A4.md' })}`,
      )
    ).status,
    400,
  );
});

test('HTTP rejects writes, cross-origin requests, and unexpected Host headers', async (t) => {
  const root = await fixture(t, { 'README.md': '# Home' });
  const server = await startServer(await Library.create(['README.md'], root));
  t.after(() => server.close());
  const write = await fetch(`${server.url}/api/library`, { method: 'POST' });
  assert.equal(write.status, 405);
  assert.equal(write.headers.get('allow'), 'GET');
  assert.equal(
    (
      await fetch(`${server.url}/api/library`, {
        headers: { Origin: 'https://example.com' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${server.url}/api/library`, {
        headers: { Origin: server.url },
      })
    ).status,
    200,
  );
  const request = get(`${server.url}/api/library`, {
    headers: { Host: 'attacker.example' },
  });
  const [response] = await once(request, 'response');
  response.resume();
  assert.equal(response.statusCode, 403);
});

test(
  'watch events refresh edited, added, renamed, and deleted Markdown files',
  { timeout: 12_000 },
  async (t) => {
    const root = await fixture(t, {
      'doc/README.md': '# Initial',
      'single.md': '# Single',
    });
    const library = await Library.create(['doc', 'single.md'], root);
    const server = await startServer(library);
    t.after(() => server.close());
    const response = await fetch(`${server.url}/events`, {
      signal: AbortSignal.timeout(10_000),
    });
    const reader = response.body!.getReader();
    t.after(() => reader.cancel());
    const decoder = new TextDecoder();
    let buffer = '';
    async function event(name: string) {
      while (!buffer.includes(`event: ${name}\n`)) {
        const chunk = await reader.read();
        assert.equal(chunk.done, false, `Stream closed before ${name}`);
        buffer += decoder.decode(chunk.value);
      }
      buffer = '';
    }
    await event('ready');
    const home = library
      .snapshot()
      .documents.find((entry) => entry.name === 'README.md')!;
    await writeFile(path.join(root, 'doc/README.md'), '# Updated');
    await event('change');
    assert.equal((await library.read(home.id))?.source, '# Updated');
    await mkdir(path.join(root, 'doc/nested'));
    await writeFile(path.join(root, 'doc/nested/added.md'), '# Added');
    await event('change');
    assert.ok(
      library.snapshot().documents.find((entry) => entry.name === 'added.md'),
    );
    await rename(
      path.join(root, 'doc/nested/added.md'),
      path.join(root, 'doc/nested/renamed.md'),
    );
    await event('change');
    assert.ok(
      library.snapshot().documents.find((entry) => entry.name === 'renamed.md'),
    );
    assert.equal(
      library.snapshot().documents.find((entry) => entry.name === 'added.md'),
      undefined,
    );
    await rm(path.join(root, 'doc/nested/renamed.md'));
    await event('change');
    assert.equal(
      library.snapshot().documents.find((entry) => entry.name === 'renamed.md'),
      undefined,
    );
    await writeFile(path.join(root, 'single.md'), '# Changed single');
    await event('change');
    const single = library
      .snapshot()
      .documents.find((entry) => entry.name === 'single.md')!;
    assert.equal((await library.read(single.id))?.source, '# Changed single');
  },
);

test(
  'omitted targets watch the caller directory and discover its first Markdown document',
  { timeout: 6000 },
  async (t) => {
    const root = await fixture(t, {});
    const library = await Library.create(parseOptions([]).targets, root);
    const server = await startServer(library);
    t.after(() => server.close());
    const response = await fetch(`${server.url}/events`, {
      signal: AbortSignal.timeout(5000),
    });
    const reader = response.body!.getReader();
    t.after(() => reader.cancel());
    await reader.read();
    await writeFile(path.join(root, 'first.md'), '# First');
    const chunk = await reader.read();
    assert.match(new TextDecoder().decode(chunk.value), /event: change/);
    assert.equal(library.snapshot().documents[0]?.name, 'first.md');
  },
);

test(
  'explicitly selected hidden Markdown files are watched',
  { timeout: 6000 },
  async (t) => {
    const root = await fixture(t, { '.notes.md': '# Notes' });
    const library = await Library.create(['.notes.md'], root);
    const server = await startServer(library);
    t.after(() => server.close());
    const response = await fetch(`${server.url}/events`, {
      signal: AbortSignal.timeout(5000),
    });
    const reader = response.body!.getReader();
    t.after(() => reader.cancel());
    await reader.read();
    await writeFile(path.join(root, '.notes.md'), '# Updated notes');
    const chunk = await reader.read();
    assert.match(new TextDecoder().decode(chunk.value), /event: change/);
    assert.equal(
      (await library.read(library.snapshot().documents[0]!.id))?.source,
      '# Updated notes',
    );
  },
);

test('an occupied port produces an error and cleans up the new watcher', async (t) => {
  const root = await fixture(t, { 'README.md': '# Home' });
  const library = await Library.create(['.'], root);
  const server = await startServer(library);
  t.after(() => server.close());
  await assert.rejects(startServer(library, Number(new URL(server.url).port)), {
    code: 'EADDRINUSE',
  });
});

test('no-watch serves documents without refreshing the library after file changes', async (t) => {
  const root = await fixture(t, { 'README.md': '# Original' });
  const library = await Library.create(['.'], root);
  let refreshes = 0;
  const originalRefresh = library.refresh.bind(library);
  library.refresh = async () => {
    refreshes++;
    await originalRefresh();
  };
  const options = parseOptions(['--no-watch']);
  const server = await startServer(library, options.port, options.watch);
  t.after(() => server.close());
  const initial = library.snapshot();
  const id = initial.documents[0]!.id;
  await writeFile(path.join(root, 'README.md'), '# Updated');
  await writeFile(path.join(root, 'new.md'), '# New');
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const snapshot = await (await fetch(`${server.url}/api/library`)).json();
  assert.deepEqual(snapshot, initial);
  assert.equal(refreshes, 0);
  const document = await (
    await fetch(`${server.url}/api/document?id=${id}`)
  ).json();
  assert.equal(document.title, 'Updated');
  await rm(path.join(root, 'README.md'));
  assert.equal(
    (await fetch(`${server.url}/api/document?id=${id}`)).status,
    404,
  );
});
