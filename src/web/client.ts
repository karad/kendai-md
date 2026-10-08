import type { LibrarySnapshot, RenderedDocument } from '../types.js';
import {
  classifyLink,
  documentScrollAction,
  groupDocuments,
  readingMinutes,
  resolveTheme,
  selectDocument,
  sidebarState,
} from './view-model.js';

const shellElements = new Map(
  [...document.querySelectorAll<HTMLElement>('[id]')].map((node) => [
    node.id,
    node,
  ]),
);

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = shellElements.get(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
}

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}

function textNode(tag: string, text: string, className = ''): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

let library: LibrarySnapshot = { project: '', documents: [], targets: [] };
let currentId: string | null = null;
let requestNumber = 0;
let libraryRequestNumber = 0;
let observer: IntersectionObserver | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const content = element('content');
const search = element<HTMLInputElement>('search');

async function api<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? 'Unable to load this document.');
  return data as T;
}

function toast(message: string) {
  element('toast').textContent = message;
  element('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element('toast').hidden = true;
  }, 4500);
}

function toggleSidebar(open: boolean) {
  const { expanded, hidden } = sidebarState(open, window.innerWidth);
  document.body.classList.toggle('sidebar-open', expanded);
  element('menu').setAttribute('aria-expanded', String(expanded));
  element('overlay').hidden = !expanded;
  element('sidebar').inert = hidden;
  element('sidebar').setAttribute('aria-hidden', String(hidden));
}

function renderFiles() {
  const groups = groupDocuments(library.documents, search.value);
  const list = element('files');
  list.replaceChildren();
  if (!groups.length)
    list.append(
      textNode(
        'p',
        search.value ? 'No matching documents.' : 'No Markdown files yet.',
        'list-empty',
      ),
    );
  for (const group of groups) {
    const section = document.createElement('section');
    if (group.directory) {
      const label = textNode('div', '', 'directory-label');
      label.append(icon('folder'), textNode('span', group.directory));
      section.append(label);
    }
    for (const entry of group.documents) {
      const link = document.createElement('a');
      link.className = 'file-link';
      link.href = `/?doc=${entry.id}`;
      link.title = entry.path;
      if (entry.id === currentId) link.setAttribute('aria-current', 'page');
      link.append(icon('file'), textNode('span', entry.name));
      link.addEventListener('click', (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        navigate(link.href);
      });
      section.append(link);
    }
    list.append(section);
  }
}

function showEmpty(title: string, message: string) {
  content.replaceChildren();
  const state = textNode('div', '', 'empty-state');
  const mark = document.createElement('img');
  mark.className = 'empty-mark';
  mark.src = '/ui/kendai-mark.png';
  mark.alt = '';
  mark.width = 46;
  mark.height = 46;
  state.append(mark, textNode('h1', title), textNode('p', message));
  content.append(state);
  content.setAttribute('aria-busy', 'false');
  element('document-meta').hidden = true;
  element('document-end').hidden = true;
  element('outline').hidden = true;
  element('pagination').replaceChildren();
  element('breadcrumb-file').textContent = 'Documents';
  document.title = `${title} · kendai-md`;
}

function jumpToHash() {
  if (!location.hash) return;
  let id: string;
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return;
  }
  const target = [...content.querySelectorAll<HTMLElement>('[id]')].find(
    (node) => node.id === id,
  );
  target?.scrollIntoView({ block: 'start' });
}

function renderOutline(data: RenderedDocument) {
  const toc = element('toc');
  toc.replaceChildren();
  observer?.disconnect();
  const headings = data.headings.filter(
    (heading) => heading.level > 1 && heading.level <= 3,
  );
  const visibleHeadings = headings.length ? headings : data.headings;
  element('outline').hidden = !visibleHeadings.length;
  for (const heading of visibleHeadings) {
    const link = document.createElement('a');
    link.href = `#${encodeURIComponent(heading.id)}`;
    link.textContent = heading.text;
    link.className = heading.level === 3 ? 'toc-nested' : '';
    toc.append(link);
  }
  toc.querySelector('a')?.setAttribute('aria-current', 'location');
  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries.find((entry) => entry.isIntersecting);
      if (!entry) return;
      for (const link of toc.querySelectorAll('a')) {
        if (link.hash === `#${encodeURIComponent(entry.target.id)}`)
          link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    },
    { rootMargin: '-80px 0px -65% 0px' },
  );
  for (const heading of content.querySelectorAll('h1, h2, h3'))
    observer.observe(heading);
}

function renderPagination() {
  const entries = groupDocuments(library.documents, '').flatMap(
    (group) => group.documents,
  );
  const index = entries.findIndex((entry) => entry.id === currentId);
  const pagination = element('pagination');
  pagination.replaceChildren();
  for (const [offset, label] of [
    [-1, 'Previous'],
    [1, 'Next'],
  ] as const) {
    const entry = entries[index + offset];
    if (!entry) {
      pagination.append(document.createElement('span'));
      continue;
    }
    const link = document.createElement('a');
    link.className = `page-link ${offset === -1 ? 'previous' : 'next'}`;
    link.href = `/?doc=${entry.id}`;
    const text = document.createElement('span');
    text.append(textNode('small', label), textNode('strong', entry.name));
    link.append(text, icon('arrow'));
    link.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      navigate(link.href);
    });
    pagination.append(link);
  }
}

function prepareContent(data: RenderedDocument) {
  for (const image of content.querySelectorAll('img')) {
    const source = image.getAttribute('src');
    if (!source) {
      image.replaceWith(
        textNode('span', image.alt || 'External image', 'image-placeholder'),
      );
      continue;
    }
    image.loading = 'lazy';
    image.addEventListener('error', () =>
      image.replaceWith(
        textNode('span', image.alt || 'Image unavailable', 'image-placeholder'),
      ),
    );
  }
  for (const link of content.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.getAttribute('href')!;
    const kind = classifyLink(href);
    if (kind === 'external') {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    } else if (kind === 'local') {
      const parameters = new URLSearchParams({ id: data.id, href });
      link.setAttribute('href', `/link?${parameters}`);
      link.addEventListener('click', async (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        event.preventDefault();
        try {
          const resolved = await api<{ url: string }>(
            `/api/resolve?${parameters}`,
          );
          navigate(resolved.url);
        } catch (error) {
          toast(
            error instanceof Error
              ? error.message
              : 'Unable to open this link.',
          );
        }
      });
    } else if (kind === 'blocked') link.removeAttribute('href');
  }
  for (const pre of content.querySelectorAll('pre')) {
    const code = pre.querySelector('code');
    if (!code) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block';
    const bar = textNode('div', '', 'code-bar');
    const language =
      [...code.classList]
        .find((name) => name.startsWith('language-'))
        ?.slice(9) ?? 'text';
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.className = 'copy-code';
    copy.setAttribute('aria-label', `Copy ${language} code`);
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent ?? '');
        toast('Code copied to clipboard.');
      } catch {
        toast('Clipboard access is unavailable in this browser.');
      }
    });
    bar.append(textNode('span', language), copy);
    pre.replaceWith(wrapper);
    wrapper.append(bar, pre);
  }
  for (const table of content.querySelectorAll('table')) {
    const wrapper = textNode('div', '', 'table-scroll');
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
}

async function loadDocument(preservePosition = false) {
  const number = ++requestNumber;
  const requested = new URLSearchParams(location.search).get('doc');
  const selected = selectDocument(library.documents, requested);
  currentId = selected?.id ?? null;
  renderFiles();
  observer?.disconnect();
  if (!selected) {
    showEmpty(
      library.documents.length ? 'Document not found' : 'A quiet workspace',
      library.documents.length
        ? 'This document may have moved. Choose a file from the sidebar to keep reading.'
        : 'No Markdown files were found in your targets. Add a .md file and it will appear here automatically.',
    );
    return;
  }
  if (requested === null)
    history.replaceState(null, '', `/?doc=${selected.id}${location.hash}`);
  content.setAttribute('aria-busy', 'true');
  try {
    const data = await api<RenderedDocument>(`/api/document?id=${selected.id}`);
    if (number !== requestNumber) return;
    const scroll = window.scrollY;
    content.innerHTML = data.html;
    content.setAttribute('aria-busy', 'false');
    prepareContent(data);
    element('document-meta').hidden = false;
    element('document-end').hidden = false;
    element('reading-time').textContent =
      `${readingMinutes(data.words)} min read`;
    element('breadcrumb-file').textContent = data.path;
    document.title = `${data.title} · kendai-md`;
    renderOutline(data);
    renderPagination();
    const scrollAction = documentScrollAction(preservePosition, location.hash);
    if (scrollAction === 'preserve')
      window.scrollTo({ top: scroll, behavior: 'instant' });
    else if (scrollAction === 'anchor') jumpToHash();
    else window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (error) {
    if (number === requestNumber)
      showEmpty(
        'Unable to open document',
        error instanceof Error
          ? error.message
          : 'Check the local server and try again.',
      );
  }
}

function navigate(url: string) {
  history.pushState(null, '', url);
  toggleSidebar(false);
  void loadDocument();
  element('main').focus({ preventScroll: true });
}

async function refresh() {
  const number = ++libraryRequestNumber;
  try {
    const snapshot = await api<LibrarySnapshot>('/api/library');
    if (number !== libraryRequestNumber) return;
    library = snapshot;
    element('project').textContent = library.project;
    element('breadcrumb-project').textContent = library.project;
    element('target-count').textContent =
      `${library.targets.length} ${library.targets.length === 1 ? 'target' : 'targets'} connected`;
    element('target-count').title = library.targets.join(', ');
    element('file-count').textContent = String(library.documents.length);
    await loadDocument(
      currentId !== null &&
        currentId === new URLSearchParams(location.search).get('doc'),
    );
  } catch (error) {
    showEmpty(
      'Unable to connect',
      'The local server is unavailable. Start kendai in your terminal to reconnect.',
    );
  }
}

search.addEventListener('input', renderFiles);
element('menu').addEventListener('click', () =>
  toggleSidebar(!document.body.classList.contains('sidebar-open')),
);
element('overlay').addEventListener('click', () => toggleSidebar(false));
element('back-top').addEventListener('click', () =>
  window.scrollTo({ top: 0, behavior: 'smooth' }),
);
element('copy-link').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    toast('Document link copied.');
  } catch {
    toast('Clipboard access is unavailable in this browser.');
  }
});

const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
let theme = resolveTheme(null, prefersDark);
try {
  theme = resolveTheme(localStorage.getItem('kendai-md-theme'), prefersDark);
} catch {
  /* Private browsing can disable storage. */
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  element('theme').setAttribute(
    'aria-label',
    `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
  );
}
applyTheme();
element('theme').addEventListener('click', () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  try {
    localStorage.setItem('kendai-md-theme', theme);
  } catch {
    /* The theme still works without persistence. */
  }
});
document.addEventListener('keydown', (event) => {
  const typing =
    event.target instanceof HTMLElement &&
    (event.target.matches('input, textarea, select') ||
      event.target.isContentEditable);
  if (
    (event.key === '/' && !typing) ||
    ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')
  ) {
    event.preventDefault();
    if (window.innerWidth <= 760) toggleSidebar(true);
    search.focus();
  }
  if (event.key === 'Escape') {
    search.value = '';
    renderFiles();
    toggleSidebar(false);
    if (typing) search.blur();
    element('menu').focus();
  }
});
window.addEventListener('popstate', () => {
  void loadDocument();
});
window.addEventListener('hashchange', jumpToHash);
matchMedia('(max-width: 760px)').addEventListener('change', () =>
  toggleSidebar(false),
);
toggleSidebar(false);

const events = new EventSource('/events');
events.addEventListener('ready', () => {
  element('connection').textContent = 'Live updates on';
  element('status-dot').classList.remove('disconnected');
  void refresh();
});
events.addEventListener('change', () => {
  void refresh();
});
events.addEventListener('watch-error', () => {
  element('connection').textContent = 'File watching interrupted';
  element('status-dot').classList.add('disconnected');
  toast('File watching failed. Check the terminal for details.');
});
events.addEventListener('error', () => {
  element('connection').textContent = 'Reconnecting to server…';
  element('status-dot').classList.add('disconnected');
});
void refresh();
