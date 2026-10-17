import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTerminalMarkdown } from '../src/tui/markdown.js';
import {
  findMatches,
  parseLink,
  highlightLine,
} from '../src/tui/navigation.js';

test('literal search crosses styled spans and paragraph wrapping with Unicode coordinates', () => {
  const layout = renderTerminalMarkdown(
    '日本語 **Hello** WORLD 日本語\n\n日本語',
    12,
  );
  assert.equal(findMatches(layout, '日本語').length, 3);
  assert.equal(findMatches(layout, 'hello world').length, 1);
  assert.equal(findMatches(layout, '').length, 0);
  assert.equal(findMatches(layout, '[').length, 0);
  const match = findMatches(layout, '日本語')[0]!;
  assert.equal(match.column, 0);
  const marked = highlightLine(layout.lines[0]!, 0, [match], 0);
  assert.ok(marked.spans.some((s) => s.backgroundColor === 'yellow'));
});
test('code ANSI does not enter search text and wide table matches retain columns', () => {
  const code = renderTerminalMarkdown('```ts\nconst hello = 1;\n```', 54);
  assert.equal(findMatches(code, 'hello').length, 1);
  const table = renderTerminalMarkdown(
    '| A | B |\n|---|---|\n| one | 日本語 |',
    12,
  );
  const m = findMatches(table, '日本語')[0]!;
  assert.ok(m.column > 0);
  assert.ok(m.tableWidth! > 12);
});
test('relative links split queries and decode anchors while rejecting unsafe inputs', () => {
  assert.deepEqual(parseLink('guide%20one.md?x=1#%E6%97%A5%E6%9C%AC'), {
    file: 'guide one.md',
    anchor: '日本',
  });
  assert.deepEqual(parseLink('#section'), { file: '', anchor: 'section' });
  for (const href of [
    'https://example.com',
    '//host/a',
    '/a',
    '\\a',
    '%2Fa',
    'file:x',
    '%66ile:x',
    '%ZZ',
    'x#%ZZ',
    'a%00b',
  ])
    assert.throws(() => parseLink(href), href);
});
test('terminal anchors match browser rules including duplicates and formatted headings', () => {
  const r = renderTerminalMarkdown(
    '# 日本語 **Title**\n\n# 日本語 **Title**\n\n# [Link](./guide) `code`',
    54,
  );
  assert.deepEqual(
    r.targets.filter((t) => t.kind === 'heading').map((t) => t.anchor),
    ['日本語-title', '日本語-title-1', 'link-code'],
  );
});
