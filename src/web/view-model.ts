import type { DocumentEntry } from '../types.js';

export interface FileGroup {
  directory: string;
  documents: DocumentEntry[];
}

export function resolveTheme(
  saved: string | null,
  prefersDark: boolean,
): 'light' | 'dark' {
  if (saved === 'light' || saved === 'dark') return saved;
  return prefersDark ? 'dark' : 'light';
}

export function sidebarState(open: boolean, width: number) {
  const expanded = open && width <= 760;
  return { expanded, hidden: width <= 760 && !expanded };
}

export function documentScrollAction(
  preservePosition: boolean,
  hash: string,
): 'preserve' | 'anchor' | 'top' {
  if (preservePosition) return 'preserve';
  return hash ? 'anchor' : 'top';
}

export function groupDocuments(
  documents: DocumentEntry[],
  query: string,
): FileGroup[] {
  const needle = query.trim().toLocaleLowerCase();
  const groups = new Map<string, DocumentEntry[]>();
  for (const document of documents) {
    if (!document.path.toLocaleLowerCase().includes(needle)) continue;
    const index = document.path.lastIndexOf('/');
    const directory = index < 0 ? '' : document.path.slice(0, index);
    const group = groups.get(directory) ?? [];
    group.push(document);
    groups.set(directory, group);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([directory, documents]) => ({
      directory,
      documents: documents.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function selectDocument(
  documents: DocumentEntry[],
  requested: string | null,
): DocumentEntry | undefined {
  if (requested !== null)
    return documents.find((document) => document.id === requested);
  return (
    documents.find((document) => document.path.toLowerCase() === 'readme.md') ??
    documents[0]
  );
}

export function readingMinutes(words: number): number {
  return Math.max(1, Math.ceil(words / 220));
}

export function classifyLink(
  href: string,
): 'anchor' | 'external' | 'local' | 'blocked' {
  if (href.startsWith('#')) return 'anchor';
  if (/^(https?:|mailto:)/i.test(href)) return 'external';
  if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(href)) return 'blocked';
  return 'local';
}
