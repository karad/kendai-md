import test from 'node:test';
import assert from 'node:assert/strict';
import stringWidth from 'string-width';
import { layoutTable, clipTableLine } from '../src/tui/table.js';
import type { Line } from '../src/tui/markdown.js';
const plain = (line: Line) => line.spans.map((s) => s.text).join('');
const cell = (text: string, align: 'left' | 'right' | 'center' = 'left') => ({
  spans: [{ text }],
  align,
});
test('table borders align across Japanese, empty cells and wrapped styled cells', () => {
  const lines = layoutTable(
    [
      [cell('Name'), cell('値')],
      [cell('日本語'.repeat(12)), cell('')],
    ],
    32,
  );
  const widths = lines.map((l) => stringWidth(plain(l)));
  assert.ok(widths.every((w) => w === widths[0]));
  assert.ok(plain(lines[0]!).startsWith('┌'));
  assert.ok(lines.some((l) => plain(l).includes('├')));
  assert.equal(lines.map(plain).join('').split('日').length - 1, 12);
  assert.ok(widths[0]! <= 32);
});
test('table cells obey left, center and right alignment and retain styles', () => {
  const lines = layoutTable(
    [
      [cell('12345'), cell('12345'), cell('12345')],
      [
        cell('x'),
        cell('x', 'center'),
        { spans: [{ text: 'x', bold: true, target: 'a' }], align: 'right' },
      ],
    ],
    80,
  );
  const row = lines.find((l) => plain(l).includes('x'))!;
  assert.equal(plain(row), '│ x     │   x   │     x │');
  assert.ok(
    row.spans.some((s) => s.bold && s.target === 'a' && s.text === 'x'),
  );
});
test('table handles header-only, uneven rows and multiline graphemes', () => {
  assert.ok(layoutTable([[cell('A')]], 20).length >= 3);
  const lines = layoutTable(
    [[cell('A'), cell('B')], [cell('e\u0301😀\n日本語')]],
    16,
  );
  assert.ok(lines.every((l) => stringWidth(plain(l)) === l.tableWidth));
  assert.ok(lines.map(plain).join('').includes('e\u0301😀'));
});
test('horizontal clipping preserves graphemes and styles and clamps per table', () => {
  const line = {
    spans: [{ text: 'a日本e\u0301😀z', bold: true, target: 'x' }],
    tableWidth: 9,
  };
  assert.equal(plain(clipTableLine(line, 2, 4)), ' 本e\u0301');
  assert.equal(stringWidth(plain(clipTableLine(line, 2, 4))), 4);
  assert.ok(
    clipTableLine(line, 2, 4).spans.some((s) => s.bold && s.target === 'x'),
  );
  assert.equal(plain(clipTableLine(line, 999, 4)), 'e\u0301😀z');
  const normal = { spans: [{ text: 'paragraph' }] };
  assert.equal(clipTableLine(normal, 10, 4), normal);
});

for (const width of [2, 54, 82]) {
  test(`wide tables remain accessible at viewport width ${width}`, () => {
    const lines = layoutTable(
      [
        Array.from({ length: 8 }, (_, i) =>
          cell(i === 0 ? 'START' : `Column${i}`),
        ),
        Array.from({ length: 8 }, (_, i) =>
          cell(i === 7 ? 'LAST日本語😀' : 'value'),
        ),
      ],
      width,
    );
    for (const line of lines) {
      for (const offset of [0, 1, 4, 999])
        assert.ok(
          stringWidth(plain(clipTableLine(line, offset, width))) <= width,
        );
    }
    if (width >= 54) {
      assert.ok(
        lines
          .map((l) => plain(clipTableLine(l, 0, width)))
          .join('\n')
          .includes('START'),
      );
      assert.ok(
        lines
          .map((l) => plain(clipTableLine(l, 999, width)))
          .join('\n')
          .includes('LAST'),
      );
    }
  });
}
test('different-width tables clamp independently without hiding short tables', () => {
  const short = layoutTable([[cell('Short')]], 54);
  assert.deepEqual(
    short.map((l) => plain(clipTableLine(l, 100, 54))),
    short.map(plain),
  );
  assert.deepEqual(layoutTable([], 20), []);
});

test('wrapped long styled links preserve every Unicode character', () => {
  const value = '日本語e\u0301😀'.repeat(40);
  const lines = layoutTable(
    [
      [cell('Link')],
      [
        {
          spans: [{ text: value, target: 'long', underline: true }],
          align: 'left',
        },
      ],
    ],
    20,
  );
  assert.equal(
    lines
      .flatMap((l) => l.spans)
      .filter((s) => s.target === 'long')
      .map((s) => s.text)
      .join(''),
    value,
  );
  assert.ok(lines.every((l) => stringWidth(plain(l)) === l.tableWidth));
});
