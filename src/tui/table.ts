import stringWidth from 'string-width';
import type { Line, Span } from './markdown.js';

export interface Cell {
  spans: Span[];
  align: 'left' | 'center' | 'right';
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const spanWidth = (spans: Span[]) =>
  spans.reduce((n, s) => n + stringWidth(s.text), 0);
const border = (text: string): Span => ({ text, dimColor: true });

function wrapCell(spans: Span[], width: number): Span[][] {
  const lines: Span[][] = [[]];
  let used = 0;
  for (const span of spans) {
    for (const { segment } of graphemes.segment(span.text)) {
      const cells = stringWidth(segment);
      if (segment === '\n' || used + cells > width) {
        lines.push([]);
        used = 0;
      }
      if (segment === '\n') continue;
      lines.at(-1)!.push({ ...span, text: segment });
      used += cells;
    }
  }
  return lines;
}

export function layoutTable(rows: Cell[][], available: number): Line[] {
  if (!rows.length) return [];
  const count = Math.max(...rows.map((row) => row.length));
  if (!count) return [];
  const widths = Array.from({ length: count }, (_, col) =>
    Math.max(
      2,
      Math.min(
        24,
        Math.max(
          ...rows.map((row) =>
            Math.max(
              0,
              ...(row[col]?.spans.map((s) => s.text).join('') ?? '')
                .split('\n')
                .map((s) => stringWidth(s)),
            ),
          ),
        ),
      ),
    ),
  );
  const minimums = widths.map((w) => Math.min(w, 6));
  let total = widths.reduce((n, w) => n + w + 3, 1);
  while (total > available) {
    let col = -1;
    for (let i = 0; i < count; i++)
      if (widths[i]! > minimums[i]! && (col < 0 || widths[i]! > widths[col]!))
        col = i;
    if (col < 0) break;
    widths[col]!--;
    total--;
  }
  const result: Line[] = [];
  const rule = (left: string, middle: string, right: string) =>
    result.push({
      spans: [
        border(
          left + widths.map((w) => '─'.repeat(w + 2)).join(middle) + right,
        ),
      ],
      tableWidth: total,
    });
  rule('┌', '┬', '┐');
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    const cells = widths.map((w, col) => wrapCell(row[col]?.spans ?? [], w));
    const height = Math.max(...cells.map((c) => c.length));
    for (let y = 0; y < height; y++) {
      const spans: Span[] = [border('│')];
      for (let col = 0; col < count; col++) {
        const content = cells[col]![y] ?? [];
        const padding = widths[col]! - spanWidth(content);
        const align = row[col]?.align ?? 'left';
        const left =
          align === 'right'
            ? padding
            : align === 'center'
              ? Math.floor(padding / 2)
              : 0;
        spans.push(
          { text: ' '.repeat(left + 1) },
          ...content,
          { text: ' '.repeat(padding - left + 1) },
          border('│'),
        );
      }
      result.push({ spans, tableWidth: total });
    }
    if (r < rows.length - 1) rule('├', '┼', '┤');
  }
  rule('└', '┴', '┘');
  return result;
}

export function clipTableLine(line: Line, offset: number, width: number): Line {
  if (line.tableWidth === undefined) return line;
  const start = Math.max(
    0,
    Math.min(offset, Math.max(0, line.tableWidth - width)),
  );
  const end = start + width;
  const spans: Span[] = [];
  let position = 0;
  for (const span of line.spans) {
    for (const { segment } of graphemes.segment(span.text)) {
      const size = stringWidth(segment),
        next = position + size;
      if (next > start && position < end) {
        if (position >= start && next <= end)
          spans.push({ ...span, text: segment });
        else
          spans.push({
            text: ' '.repeat(Math.min(next, end) - Math.max(position, start)),
          });
      }
      position = next;
      if (position >= end) return { ...line, spans };
    }
  }
  return { ...line, spans };
}
