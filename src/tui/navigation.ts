import stringWidth from 'string-width';
import stripAnsi from 'strip-ansi';
import type { Layout, Line, Span } from './markdown.js';

export interface Match {
  row: number;
  column: number;
  tableWidth?: number;
  ranges: { row: number; start: number; end: number }[];
}
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function parseLink(href: string): { file: string; anchor: string } {
  const forbidden = (text: string) =>
    /^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(text) || /[\x00-\x1f\x7f]/.test(text);
  if (forbidden(href))
    throw new Error('Only relative document links are supported.');
  const hash = href.indexOf('#');
  const file = decodeURIComponent(
    (hash < 0 ? href : href.slice(0, hash)).split('?')[0] ?? '',
  );
  const anchor =
    hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1)).normalize('NFC');
  if (forbidden(file) || /[\x00-\x1f\x7f]/.test(anchor))
    throw new Error('Only relative document links are supported.');
  return { file, anchor };
}

export function findMatches(layout: Layout, query: string): Match[] {
  const needle = query.normalize('NFC').toLowerCase();
  if (!needle) return [];
  let text = '';
  const positions: { row: number; column: number; size: number }[] = [];
  for (let row = 0; row < layout.lines.length; row++) {
    const line = layout.lines[row]!;
    const visible = stripAnsi(line.spans.map((s) => s.text).join(''));
    let column = 0;
    for (const { segment } of segments.segment(visible)) {
      const normalized = segment.normalize('NFC').toLowerCase();
      const size = stringWidth(segment);
      text += normalized;
      for (let i = 0; i < normalized.length; i++)
        positions.push({ row, column, size });
      column += size;
    }
    if (!visible.trim()) {
      text += '\n';
      positions.push({ row, column, size: 0 });
    }
  }
  const matches: Match[] = [];
  let from = 0,
    index;
  while ((index = text.indexOf(needle, from)) >= 0) {
    const points = positions.slice(index, index + needle.length);
    const first = points[0]!;
    const ranges: Match['ranges'] = [];
    for (const point of points) {
      const previous = ranges.at(-1);
      if (previous?.row === point.row)
        previous.end = Math.max(previous.end, point.column + point.size);
      else
        ranges.push({
          row: point.row,
          start: point.column,
          end: point.column + point.size,
        });
    }
    matches.push({
      row: first.row,
      column: first.column,
      tableWidth: layout.lines[first.row]!.tableWidth,
      ranges,
    });
    from = index + needle.length;
  }
  return matches;
}

export function highlightLine(
  line: Line,
  row: number,
  matches: Match[],
  selected: number,
): Line {
  const ranges = matches.flatMap((match, i) =>
    match.ranges
      .filter((r) => r.row === row)
      .map((r) => ({ ...r, selected: i === selected })),
  );
  if (!ranges.length) return line;
  const spans: Span[] = [];
  let column = 0;
  for (const span of line.spans) {
    for (const { segment } of segments.segment(stripAnsi(span.text))) {
      const size = stringWidth(segment);
      const range = ranges.find(
        (r) => column < r.end && column + size > r.start,
      );
      spans.push({
        ...span,
        text: segment,
        ...(range
          ? {
              backgroundColor: range.selected ? 'yellow' : 'blue',
              color: range.selected ? 'black' : 'white',
            }
          : {}),
      });
      column += size;
    }
  }
  return { ...line, spans };
}
