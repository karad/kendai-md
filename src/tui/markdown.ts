import MarkdownIt from 'markdown-it';
import GithubSlugger from 'github-slugger';
import type Token from 'markdown-it/lib/token.mjs';
import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';
import { highlight, supportsLanguage } from 'cli-highlight';
import { safeText } from './text.js';
import { layoutTable, type Cell } from './table.js';

export interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dimColor?: boolean;
  color?: string;
  backgroundColor?: string;
  target?: string;
}
export interface Line {
  spans: Span[];
  tableWidth?: number;
}
export interface Target {
  id: string;
  kind: 'heading' | 'link' | 'image';
  label: string;
  href?: string;
  row: number;
  column?: number;
  tableWidth?: number;
  anchor?: string;
  level?: number;
}
export interface Layout {
  lines: Line[];
  targets: Target[];
}
const parser = new MarkdownIt({ html: false, linkify: true });
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
type Style = Omit<Span, 'text'>;

export function renderTerminalMarkdown(
  source: string,
  columns: number,
): Layout {
  const width = Math.max(2, columns);
  const slugger = new GithubSlugger();
  const lines: Line[] = [],
    targets: Target[] = [];
  const byId = new Map<string, Target>();
  const lists: {
    ordered: boolean;
    next: number;
    marker: string;
    pending: boolean;
  }[] = [];
  let quoteDepth = 0;
  let heading: Target | undefined;
  let headingLevel = 0;
  let table: Cell[][] | null = null;
  let cell: Cell | undefined;
  let headerCell = false;
  const target = (kind: Target['kind'], label: string, href?: string) => {
    const item: Target = {
      id: `target-${targets.length}`,
      kind,
      label,
      href,
      row: -1,
    };
    targets.push(item);
    byId.set(item.id, item);
    return item;
  };
  const prefixes = (consume = true) => {
    const frame = lists.at(-1);
    const base =
      '│ '.repeat(Math.min(quoteDepth, width)) +
      '  '.repeat(Math.min(Math.max(0, lists.length - 1), width));
    const marker = frame
      ? frame.pending
        ? frame.marker
        : ' '.repeat(frame.marker.length)
      : '';
    if (frame && consume) frame.pending = false;
    const first = (base + marker).slice(0, width - 2);
    const next = (base + ' '.repeat(marker.length)).slice(0, width - 2);
    return { first, next };
  };
  const emit = (spans: Span[]) => {
    const prefix = prefixes();
    let row: Span[] = prefix.first
      ? [{ text: prefix.first, dimColor: true }]
      : [];
    let used = stringWidth(prefix.first);
    const flush = () => {
      for (const span of row) {
        const item = span.target ? byId.get(span.target) : undefined;
        if (item && item.row < 0) item.row = lines.length;
      }
      lines.push({ spans: row });
      row = prefix.next ? [{ text: prefix.next, dimColor: true }] : [];
      used = stringWidth(prefix.next);
    };
    for (const span of spans) {
      for (const { segment } of graphemes.segment(span.text)) {
        if (segment === '\n') {
          flush();
          continue;
        }
        const cells = stringWidth(segment);
        if (used + cells > width) flush();
        const previous = row.at(-1);
        const { text: _text, ...style } = span;
        const same =
          previous &&
          Object.keys(style).every(
            (key) => previous[key as keyof Span] === style[key as keyof Style],
          ) &&
          Object.keys(previous).filter((key) => key !== 'text').length ===
            Object.keys(style).length;
        if (same) previous.text += segment;
        else row.push({ ...style, text: segment });
        used += cells;
      }
    }
    flush();
  };
  const blank = () => {
    if (lines.length && lines.at(-1)!.spans.some((s) => s.text.trim()))
      lines.push({ spans: [] });
  };
  const inline = (tokens: Token[], defaultStyle: Style = {}): Span[] => {
    const result: Span[] = [];
    let style = { ...defaultStyle };
    const stack: Style[] = [];
    const links: Target[] = [];
    const push = (text: string, extra: Style = {}) =>
      result.push({ ...style, ...extra, text: safeText(text) });
    for (const [index, token] of tokens.entries()) {
      if (
        ['strong_open', 'em_open', 's_open', 'link_open'].includes(token.type)
      ) {
        stack.push(style);
        style = { ...style };
        if (token.type === 'strong_open') style.bold = true;
        else if (token.type === 'em_open') style.italic = true;
        else if (token.type === 's_open') style.strikethrough = true;
        else {
          const link = target(
            'link',
            '',
            safeText(String(token.attrGet('href') ?? '')),
          );
          links.push(link);
          style = { ...style, underline: true, color: 'blue', target: link.id };
          if (tokens[index + 1]?.type === 'image') push('[Link] ');
        }
      } else if (
        ['strong_close', 'em_close', 's_close', 'link_close'].includes(
          token.type,
        )
      ) {
        if (token.type === 'link_close') {
          const link = links.pop();
          if (link) {
            link.label ||=
              result
                .filter((s) => s.target === link.id)
                .map((s) => s.text)
                .join('') ||
              link.href ||
              'Link';
            if (!result.some((s) => s.target === link.id)) push('Link');
            push(` (${link.href})`, { dimColor: true });
          }
        }
        style = stack.pop() ?? defaultStyle;
      } else if (token.type === 'code_inline')
        push(token.content, { backgroundColor: 'gray', color: 'white' });
      else if (token.type === 'image') {
        const description =
          (token.children ?? []).map((child) => child.content).join('') ||
          token.content ||
          'Image';
        const image = target(
          'image',
          safeText(description),
          safeText(String(token.attrGet('src') ?? '')),
        );
        const outer = links.at(-1);
        if (outer) outer.label ||= image.label;
        push(`[Image: ${image.label}] ${image.href}`, {
          target: image.id,
          underline: true,
          color: 'magenta',
        });
      } else if (token.type === 'softbreak' || token.type === 'hardbreak')
        push('\n');
      else if (
        token.type === 'text' ||
        token.type === 'html_inline' ||
        token.nesting === 0
      )
        push(token.content);
    }
    return result;
  };
  const tokens = parser.parse(safeText(source), {});
  for (const token of tokens) {
    switch (token.type) {
      case 'blockquote_open':
        quoteDepth++;
        break;
      case 'blockquote_close':
        quoteDepth--;
        blank();
        break;
      case 'bullet_list_open':
      case 'ordered_list_open':
        lists.push({
          ordered: token.type === 'ordered_list_open',
          next: Number(token.attrGet('start') ?? 1),
          marker: '',
          pending: false,
        });
        break;
      case 'bullet_list_close':
      case 'ordered_list_close':
        lists.pop();
        if (!lists.length) blank();
        break;
      case 'list_item_open': {
        const frame = lists.at(-1)!;
        frame.marker = frame.ordered ? `${frame.next++}. ` : '- ';
        frame.pending = true;
        break;
      }
      case 'heading_open':
        headingLevel = Number(token.tag.slice(1));
        heading = target('heading', '');
        break;
      case 'heading_close':
        heading = undefined;
        blank();
        break;
      case 'table_open':
        table = [];
        break;
      case 'tr_open':
        table?.push([]);
        break;
      case 'td_open':
      case 'th_open': {
        const alignment = token.attrGet('style') ?? '';
        cell = {
          spans: [],
          align: alignment.includes('right')
            ? 'right'
            : alignment.includes('center')
              ? 'center'
              : 'left',
        };
        table?.at(-1)?.push(cell);
        headerCell = token.type === 'th_open';
        break;
      }
      case 'td_close':
      case 'th_close':
        cell = undefined;
        headerCell = false;
        break;
      case 'table_close': {
        const prefix = prefixes();
        for (const [index, line] of layoutTable(
          table ?? [],
          width - stringWidth(prefix.next),
        ).entries()) {
          const leading = index === 0 ? prefix.first : prefix.next;
          line.spans.unshift({ text: leading, dimColor: true });
          line.tableWidth! += stringWidth(leading);
          let column = 0;
          for (const span of line.spans) {
            const item = span.target ? byId.get(span.target) : undefined;
            if (item && item.row < 0) {
              item.row = lines.length;
              item.column = column;
              item.tableWidth = line.tableWidth;
            }
            column += stringWidth(span.text);
          }
          lines.push(line);
        }
        table = null;
        blank();
        break;
      }
      case 'inline': {
        const spans = inline(
          token.children ?? [],
          heading
            ? { bold: true, color: 'cyan', target: heading.id }
            : headerCell
              ? { bold: true }
              : {},
        );
        if (heading) {
          const headingText = (token.children ?? [])
            .filter((child) =>
              ['text', 'code_inline', 'image'].includes(child.type),
            )
            .map((child) => child.content)
            .join('');
          heading.anchor = slugger.slug(headingText) || slugger.slug('section');
          heading.level = headingLevel;
          heading.label = spans.map((s) => s.text).join('') || 'Heading';
          spans.unshift({
            text: `${'#'.repeat(headingLevel)} `,
            bold: true,
            color: 'cyan',
            target: heading.id,
          });
        }
        if (cell) cell.spans.push(...spans);
        else emit(spans);
        break;
      }
      case 'paragraph_close':
        if (!token.hidden) blank();
        break;
      case 'fence':
      case 'code_block': {
        const language =
          safeText(token.info).trim().split(/\s/)[0] || 'plaintext';
        emit([{ text: `Code: ${language}`, dimColor: true }]);
        const prefix = prefixes();
        const codePrefix =
          width >= 4 ? `${prefix.next.slice(0, width - 4)}│ ` : '';
        const codeWidth = width - stringWidth(codePrefix);
        const code = highlight(token.content.replace(/\n$/, ''), {
          language: supportsLanguage(language) ? language : 'plaintext',
          ignoreIllegals: true,
        });
        for (const row of wrapAnsi(code, codeWidth, {
          hard: true,
          trim: false,
          wordWrap: false,
        }).split('\n')) {
          lines.push({
            spans: [{ text: codePrefix, dimColor: true }, { text: row }],
          });
        }
        blank();
        break;
      }
      case 'hr':
        emit([
          {
            text: '─'.repeat(
              Math.max(2, width - stringWidth(prefixes(false).first)),
            ),
            dimColor: true,
          },
        ]);
        break;
      default:
        break;
    }
  }
  while (lines.length > 1 && lines.at(-1)!.spans.length === 0) lines.pop();
  if (!lines.length) lines.push({ spans: [] });
  return { lines, targets: targets.filter((t) => t.row >= 0) };
}
