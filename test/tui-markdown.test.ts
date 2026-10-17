import test from 'node:test';
import assert from 'node:assert/strict';
import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import { renderTerminalMarkdown } from '../src/tui/markdown.js';
const text = (source: string, width = 54) =>
  renderTerminalMarkdown(source, width)
    .lines.map((line) =>
      stripAnsi(line.spans.map((span) => span.text).join('')),
    )
    .join('\n');
test('renders headings and nested emphasis as styled spans', () => {
  const r = renderTerminalMarkdown(
    '# Title\n\n**bold *nested*** ~~gone~~ `code` [Guide](./guide.md)',
    54,
  );
  const spans = r.lines.flatMap((line) => line.spans);
  assert.ok(spans.some((s) => s.text.includes('Title') && s.bold));
  assert.ok(spans.some((s) => s.text.includes('nested') && s.bold && s.italic));
  assert.ok(spans.some((s) => s.text.includes('gone') && s.strikethrough));
  assert.ok(spans.some((s) => s.text.includes('code') && s.backgroundColor));
  assert.ok(spans.some((s) => s.text.includes('Guide') && s.underline));
  assert.deepEqual(
    r.targets.map((t) => t.kind),
    ['heading', 'link'],
  );
});
test('preserves nested lists, ordered starts, task states and quote prefixes', () => {
  const result = text(
    '3. First\n4. Second\n   - [x] Done\n   - [ ] Pending\n\n> Quoted\n>\n> > Nested quote',
  );
  for (const value of [
    '3. First',
    '4. Second',
    '- [x] Done',
    '- [ ] Pending',
    '│ Quoted',
    '│ │ Nested quote',
  ])
    assert.ok(result.includes(value), result);
});
test('keeps code, unknown languages, table cells, images and raw HTML readable', () => {
  const source =
    '```ts\nconst value = 1;\n```\n\n```not-a-language\nunknown code\n```\n\n| A | B |\n|---|---|\n| one | two |\n\n![Diagram](./a.png)\n\n<script>never run</script>';
  const result = text(source);
  for (const value of [
    'const value = 1;',
    'unknown code',
    'one │ two',
    'Image: Diagram',
    './a.png',
    '<script>never run</script>',
  ])
    assert.ok(result.includes(value), result);
});
test('keeps stable document-order targets including same-line and heading/table links', () => {
  const source =
    '# [Title](./a)\n\n[One](./one) [Two](./two)\n\n| Link |\n|---|\n| [Cell](./cell) |\n\n## Last';
  const wide = renderTerminalMarkdown(source, 54),
    narrow = renderTerminalMarkdown(source, 12);
  assert.deepEqual(
    wide.targets.map((t) => t.kind),
    ['heading', 'link', 'link', 'link', 'link', 'heading'],
  );
  assert.deepEqual(
    wide.targets.map((t) => t.id),
    narrow.targets.map((t) => t.id),
  );
  assert.equal(wide.targets[2]!.row, wide.targets[3]!.row);
  for (const t of narrow.targets)
    assert.ok(t.row >= 0 && t.row < narrow.lines.length);
});
for (const width of [12, 32, 54]) {
  test(`wraps Unicode and deep indentation within ${width} columns`, () => {
    const source =
      '> > > - 日本語 e\u0301 😀 ' +
      'longword'.repeat(20) +
      '\n\n[Long label 日本語](https://example.invalid/' +
      'x'.repeat(60) +
      ')';
    const r = renderTerminalMarkdown(source, width);
    assert.ok(
      r.lines.every(
        (line) => stringWidth(line.spans.map((s) => s.text).join('')) <= width,
      ),
    );
    assert.ok(text(source, width).includes('日本語'));
  });
}
test('strips document control sequences, retains empty headings and leaves code links inactive', () => {
  const r = renderTerminalMarkdown(
    '#\n\n\u001b]0;bad\u0007\n\n```md\n[Not a link](./x)\n```',
    32,
  );
  assert.equal(r.targets.length, 1);
  assert.equal(r.targets[0]!.row, 0);
  assert.ok(
    !text('\u001b[31mRed\u001b[0m\u001b]0;bad\u0007').includes('\u001b'),
  );
});

test('keeps deep quoted code within the viewport and preserves code whitespace', () => {
  const source =
    '> > > > > > > > ```ts\n> > > > > > > > const value = 1;\n> > > > > > > > ```';
  const r = renderTerminalMarkdown(source, 12);
  assert.ok(
    r.lines.every(
      (line) => stringWidth(line.spans.map((s) => s.text).join('')) <= 12,
    ),
  );
});
test('retains the full Unicode paragraph after wrapping and handles empty input', () => {
  const source = '日本語e\u0301😀' + 'x'.repeat(80);
  assert.equal(text(source, 12).replaceAll('\n', ''), source.normalize('NFC'));
  assert.equal(renderTerminalMarkdown('', 54).targets.length, 0);
  assert.ok(renderTerminalMarkdown('', 54).lines.length > 0);
});

test('removes terminal commands decoded from Markdown character references', () => {
  const r = renderTerminalMarkdown(
    '&#x1b;[31mDanger&#x1b;[0m&#7;\n\n![&#x1b;[2J](./safe.png)',
    54,
  );
  const rendered = r.lines
    .flatMap((line) => line.spans)
    .map((span) => span.text)
    .join('');
  assert.ok(!/[\x00-\x08\x1b\x7f-\x9f]/.test(rendered));
  assert.ok(rendered.includes('Danger'));
});

test('table links retain order and physical positions after wrapping and nesting', () => {
  const source =
    '> | 名前 | Link | 最後 |\n> |:---|:---:|---:|\n> | 日本語日本語日本語 | **[先頭](./first)** | [末尾](./last) |';
  const narrow = renderTerminalMarkdown(source, 20),
    wide = renderTerminalMarkdown(source, 80);
  assert.deepEqual(
    narrow.targets.map((t) => t.id),
    wide.targets.map((t) => t.id),
  );
  assert.equal(narrow.targets.length, 2);
  for (const t of narrow.targets) {
    const line = narrow.lines[t.row]!;
    assert.equal(t.tableWidth, line.tableWidth);
    const index = line.spans.findIndex((s) => s.target === t.id);
    assert.equal(
      t.column,
      stringWidth(
        line.spans
          .slice(0, index)
          .map((s) => s.text)
          .join(''),
      ),
    );
  }
  assert.ok(
    narrow.lines
      .filter((l) => l.tableWidth)
      .every(
        (l) =>
          stringWidth(l.spans.map((s) => s.text).join('')) === l.tableWidth,
      ),
  );
  assert.ok(text('| H |\n|---|\n| a\\|b |').includes('a|b'));
});

test('images are stable selectable targets including linked images, headings and table cells', () => {
  const source =
    '# ![見出し](./head.png)\n\n[![図](./図%20one.png)](./guide.md) ![](./empty.png)\n\n| A | B |\n|---|---|\n| value | ![Cell](./cell.png) |';
  const wide = renderTerminalMarkdown(source, 54),
    narrow = renderTerminalMarkdown(source, 12);
  assert.deepEqual(
    wide.targets.map((t) => t.kind),
    ['heading', 'image', 'link', 'image', 'image', 'image'],
  );
  assert.deepEqual(
    wide.targets.map((t) => t.id),
    narrow.targets.map((t) => t.id),
  );
  assert.equal(wide.targets[4]!.label, 'Image');
  assert.equal(wide.targets[3]!.href, './%E5%9B%B3%20one.png');
  for (const t of narrow.targets) assert.ok(t.row >= 0);
  assert.ok(narrow.targets.at(-1)!.column! > 0);
  assert.ok(text(source).includes('[Link]'));
  assert.ok(text(source).includes('[Image: Image] ./empty.png'));
});
