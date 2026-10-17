import stripAnsi from 'strip-ansi';
import wrapAnsi from 'wrap-ansi';

export function safeText(source: string): string {
  return stripAnsi(source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'))
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
    .replaceAll('\t', '    ')
    .normalize('NFC');
}

export function plainLines(source: string, columns: number): string[] {
  return wrapAnsi(safeText(source), Math.max(2, columns), {
    hard: true,
    trim: false,
    wordWrap: false,
  }).split('\n');
}
