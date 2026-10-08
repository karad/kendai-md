import MarkdownIt from 'markdown-it';
import GithubSlugger from 'github-slugger';
import hljs from 'highlight.js';
import sanitizeHtml from 'sanitize-html';
import type { Library } from './library.js';
import type { Heading, RenderedDocument } from './types.js';

export function renderMarkdown(
  source: string,
  documentId?: string,
): { html: string; headings: Heading[]; title: string; words: number } {
  const headings: Heading[] = [];
  const slugger = new GithubSlugger();
  const markdown = new MarkdownIt({
    html: true,
    linkify: true,
    highlight(code, language) {
      return language && hljs.getLanguage(language)
        ? hljs.highlight(code, { language, ignoreIllegals: true }).value
        : '';
    },
  });
  markdown.renderer.rules.heading_open = (
    tokens,
    index,
    options,
    env,
    renderer,
  ) => {
    const token = tokens[index]!;
    const inline = tokens[index + 1];
    const text = (inline?.children ?? [])
      .filter((child) => ['text', 'code_inline', 'image'].includes(child.type))
      .map((child) => child.content)
      .join('');
    const id = slugger.slug(text) || slugger.slug('section');
    token.attrSet('id', id);
    headings.push({ id, text, level: Number(token.tag.slice(1)) });
    return renderer.renderToken(tokens, index, options);
  };
  markdown.core.ruler.after('inline', 'task_lists', (state) => {
    for (let i = 2; i < state.tokens.length; i++) {
      const token = state.tokens[i]!;
      if (
        token.type !== 'inline' ||
        state.tokens[i - 2]?.type !== 'list_item_open'
      )
        continue;
      const first = token.children?.[0];
      const match =
        first?.type === 'text' && /^\[([ xX])\]\s+/.exec(first.content);
      if (!match || !first) continue;
      first.content = first.content.slice(match[0].length);
      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = `<input type="checkbox" disabled${match[1]?.toLowerCase() === 'x' ? ' checked' : ''}> `;
      token.children!.unshift(checkbox);
      state.tokens[i - 2]!.attrJoin('class', 'task-list-item');
    }
  });
  const html = sanitizeHtml(markdown.render(source.replace(/^\uFEFF/, '')), {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'img',
      'input',
      'details',
      'summary',
      'kbd',
      's',
      'del',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      code: ['class'],
      span: ['class'],
      li: ['class'],
      input: ['type', 'disabled', 'checked'],
      h1: ['id'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id'],
      h5: ['id'],
      h6: ['id'],
      th: ['align'],
      td: ['align'],
      ol: ['start'],
      details: ['open'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedClasses: {
      code: [/^language-[\w+-]+$/],
      span: [/^hljs-[\w-]+$/],
      li: ['task-list-item'],
    },
    allowProtocolRelative: false,
    transformTags: {
      input: (_tag, attributes) => ({
        tagName: 'input',
        attribs: {
          type: 'checkbox',
          disabled: '',
          ...(Object.hasOwn(attributes, 'checked') ? { checked: '' } : {}),
        },
      }),
      img: (_tag, attributes) => {
        if (!documentId) return { tagName: 'img', attribs: attributes };
        const { src, ...rest } = attributes;
        if (!src || /^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(src))
          return { tagName: 'img', attribs: rest };
        try {
          const file = decodeURIComponent(src.split(/[?#]/)[0] ?? '');
          return {
            tagName: 'img',
            attribs: {
              ...rest,
              src: `/asset?${new URLSearchParams({ id: documentId, path: file, v: String(Date.now()) })}`,
            },
          };
        } catch {
          return { tagName: 'img', attribs: rest };
        }
      },
    },
  });
  const words = [
    ...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(source),
  ].filter((part) => part.isWordLike).length;
  return {
    html,
    headings,
    title: headings.find((heading) => heading.level === 1)?.text ?? '',
    words,
  };
}

export async function renderDocument(
  library: Library,
  id: string,
): Promise<RenderedDocument | undefined> {
  const document = await library.read(id);
  if (!document) return;
  const rendered = renderMarkdown(document.source, id);
  return {
    ...document.entry,
    ...rendered,
    title: rendered.title || document.entry.name,
    modifiedAt: document.modifiedAt,
  };
}
