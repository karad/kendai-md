import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyLink,
  documentScrollAction,
  groupDocuments,
  readingMinutes,
  resolveTheme,
  selectDocument,
  sidebarState,
} from '../src/web/view-model.js';

const docs = [
  { id: 'guide', name: 'Guide.md', path: 'doc/Guide.md' },
  { id: 'home', name: 'README.md', path: 'README.md' },
  { id: 'api', name: 'API.md', path: 'doc/API.md' },
];

test('saved light and dark themes override either system preference', () => {
  for (const prefersDark of [false, true]) {
    assert.equal(resolveTheme('light', prefersDark), 'light');
    assert.equal(resolveTheme('dark', prefersDark), 'dark');
  }
});

test('missing or invalid saved themes fall back to the system preference', () => {
  for (const saved of [null, '', 'sepia', 'DARK']) {
    assert.equal(resolveTheme(saved, true), 'dark');
    assert.equal(resolveTheme(saved, false), 'light');
  }
});

test('mobile navigation is hidden when closed and accessible when expanded', () => {
  for (const width of [375, 760]) {
    assert.deepEqual(sidebarState(false, width), {
      expanded: false,
      hidden: true,
    });
    assert.deepEqual(sidebarState(true, width), {
      expanded: true,
      hidden: false,
    });
  }
});

test('desktop navigation stays accessible without a drawer overlay', () => {
  for (const width of [761, 1280]) {
    for (const open of [false, true]) {
      assert.deepEqual(sidebarState(open, width), {
        expanded: false,
        hidden: false,
      });
    }
  }
});

test('live updates preserve reading position even when the URL has an anchor', () => {
  assert.equal(documentScrollAction(true, ''), 'preserve');
  assert.equal(documentScrollAction(true, '#installation'), 'preserve');
});

test('document navigation uses an anchor when present and otherwise starts at the top', () => {
  assert.equal(documentScrollAction(false, '#installation'), 'anchor');
  assert.equal(documentScrollAction(false, ''), 'top');
});

test('document groups place root files first and sort filenames within folders', () => {
  assert.deepEqual(
    groupDocuments(docs, '').map((group) => [
      group.directory,
      group.documents.map((entry) => entry.id),
    ]),
    [
      ['', ['home']],
      ['doc', ['api', 'guide']],
    ],
  );
});

test('search matches paths case-insensitively and handles empty results', () => {
  assert.deepEqual(
    groupDocuments(docs, '  DOC/g  ')[0]!.documents.map((entry) => entry.id),
    ['guide'],
  );
  assert.deepEqual(groupDocuments(docs, 'missing'), []);
  assert.deepEqual(groupDocuments([], ''), []);
});

test('initial selection prefers root README then target order', () => {
  assert.equal(selectDocument(docs, null)?.id, 'home');
  assert.equal(selectDocument([docs[0]!], null)?.id, 'guide');
  assert.equal(selectDocument([], null), undefined);
});

test('requested documents select exactly and stale URLs remain missing', () => {
  assert.equal(selectDocument(docs, 'api')?.id, 'api');
  assert.equal(selectDocument(docs, 'removed'), undefined);
});

test('reading estimates round up and short documents take at least one minute', () => {
  assert.equal(readingMinutes(0), 1);
  assert.equal(readingMinutes(220), 1);
  assert.equal(readingMinutes(221), 2);
});

test('links distinguish anchors, external URLs, relative documents, and unsafe schemes', () => {
  for (const href of ['#heading', '#日本語'])
    assert.equal(classifyLink(href), 'anchor');
  for (const href of [
    'https://example.com',
    'HTTP://example.com',
    'mailto:hello@example.com',
  ])
    assert.equal(classifyLink(href), 'external');
  for (const href of ['./guide.md', '../README.md#start', 'my%20file.md'])
    assert.equal(classifyLink(href), 'local');
  for (const href of [
    'javascript:alert(1)',
    '//example.com',
    '/etc/passwd',
    '\\server\file',
    'data:text/html,test',
    'file:///tmp/a.md',
  ])
    assert.equal(classifyLink(href), 'blocked');
});
