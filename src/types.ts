export interface DocumentEntry {
  id: string;
  name: string;
  path: string;
}

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface RenderedDocument extends DocumentEntry {
  html: string;
  headings: Heading[];
  title: string;
  words: number;
  modifiedAt: string;
}

export interface LibrarySnapshot {
  project: string;
  targets: string[];
  documents: DocumentEntry[];
}
