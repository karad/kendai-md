import { createHash } from 'node:crypto';
import { readdir, realpath, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentEntry, LibrarySnapshot } from './types.js';

export const imageTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
};

export function isMarkdown(file: string): boolean {
  return /\.(md|markdown)$/i.test(file);
}

export function isWithin(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  );
}

const ignoredDirectories = new Set([
  'node_modules',
  'bower_components',
  'vendor',
  'dist',
  'build',
  'coverage',
  'venv',
  '__pycache__',
]);

export function isIgnored(file: string): boolean {
  return file
    .split(/[\\/]/)
    .some(
      (part) =>
        (part.startsWith('.') && part !== '.' && part !== '..') ||
        ignoredDirectories.has(part),
    );
}

interface Target {
  file: string;
  directory: boolean;
  label: string;
}
interface StoredDocument {
  entry: DocumentEntry;
  file: string;
}

export class Library {
  private documents = new Map<string, StoredDocument>();
  private byPath = new Map<string, string>();
  private constructor(
    readonly cwd: string,
    readonly targets: Target[],
  ) {}

  static async create(
    targets: string[],
    cwd = process.cwd(),
  ): Promise<Library> {
    const resolved: Target[] = [];
    for (const target of targets) {
      const input = path.resolve(cwd, target);
      let file: string;
      let info;
      try {
        file = await realpath(input);
        info = await stat(file);
      } catch {
        throw new Error(`Cannot read target: ${target}`);
      }
      if (!info.isDirectory() && (!info.isFile() || !isMarkdown(file))) {
        throw new Error(
          `Target must be a Markdown file or directory: ${target}`,
        );
      }
      if (!resolved.some((item) => item.file === file)) {
        resolved.push({ file, directory: info.isDirectory(), label: target });
      }
    }
    const library = new Library(path.resolve(cwd), resolved);
    await library.refresh();
    return library;
  }

  async refresh(): Promise<void> {
    const documents = new Map<string, StoredDocument>();
    const byPath = new Map<string, string>();
    const add = (file: string) => {
      if (byPath.has(file)) return;
      const id = createHash('sha256').update(file).digest('hex');
      const entry = {
        id,
        name: path.basename(file),
        path: path.relative(this.cwd, file).split(path.sep).join('/'),
      };
      documents.set(id, { entry, file });
      byPath.set(file, id);
    };
    const walk = async (directory: string) => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return;
        throw error;
      }
      for (const entry of entries.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        if (isIgnored(entry.name) || entry.isSymbolicLink()) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (entry.isFile() && isMarkdown(file)) add(file);
      }
    };
    for (const target of this.targets) {
      try {
        if ((await realpath(target.file)) !== target.file) continue;
        if (target.directory) await walk(target.file);
        else if ((await stat(target.file)).isFile()) add(target.file);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    this.documents = documents;
    this.byPath = byPath;
  }

  snapshot(): LibrarySnapshot {
    return {
      project: path.basename(this.cwd),
      targets: this.targets.map((target) => target.label),
      documents: [...this.documents.values()].map(({ entry }) => entry),
    };
  }

  shouldWatch(file: string, directory?: boolean): boolean {
    const candidate = path.resolve(file);
    return this.targets.some((target) => {
      if (candidate === target.file) return true;
      if (!target.directory || !isWithin(target.file, candidate)) return false;
      if (isIgnored(path.relative(target.file, candidate))) return false;
      // Keep directories discoverable so newly added Markdown files are watched.
      return directory !== false || isMarkdown(candidate);
    });
  }

  get(id: string): StoredDocument | undefined {
    return this.documents.get(id);
  }

  async read(
    id: string,
  ): Promise<
    { entry: DocumentEntry; source: string; modifiedAt: string } | undefined
  > {
    const document = this.get(id);
    if (!document) return;
    try {
      // Recheck the real path because a watched file may have been replaced by a symlink.
      if ((await realpath(document.file)) !== document.file) return;
      const info = await stat(document.file);
      if (!info.isFile()) return;
      return {
        entry: document.entry,
        source: await readFile(document.file, 'utf8'),
        modifiedAt: info.mtime.toISOString(),
      };
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  async resolveDocument(
    sourceId: string,
    href: string,
  ): Promise<string | undefined> {
    const source = this.get(sourceId);
    if (!source) return;
    const candidate = path.resolve(path.dirname(source.file), href);
    let canonical: string;
    try {
      canonical = await realpath(candidate);
    } catch {
      return;
    }
    const direct = this.byPath.get(canonical);
    if (direct) return direct;
    for (const name of ['README.md', 'readme.md', 'index.md']) {
      const id = this.byPath.get(path.join(canonical, name));
      if (id) return id;
    }
  }

  async resolveAsset(
    sourceId: string,
    href: string,
  ): Promise<{ file: string; type: string } | undefined> {
    const source = this.get(sourceId);
    if (!source) return;
    const requested = path.resolve(path.dirname(source.file), href);
    let file: string;
    try {
      file = await realpath(requested);
    } catch {
      return;
    }
    const type = imageTypes[path.extname(file).toLowerCase()];
    if (!type) return;
    const allowed = this.targets.some((target) => {
      const root = target.directory ? target.file : path.dirname(target.file);
      return isWithin(root, file) && !isIgnored(path.relative(root, file));
    });
    if (!allowed || !(await stat(file)).isFile()) return;
    return { file, type };
  }
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['ENOENT', 'ENOTDIR'].includes(String(error.code))
  );
}
