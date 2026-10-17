import type { DocumentEntry, LibrarySnapshot } from '../types.js';
import {
  renderTerminalMarkdown,
  type Layout,
  type Target,
} from './markdown.js';
import {
  initialState,
  reduce,
  type Document,
  type Event,
  type State,
} from './model.js';
import { findMatches, parseLink, type Match } from './navigation.js';
import { safeText } from './text.js';
import { imagePath, type ImageOpener } from './images.js';

export interface Reader {
  snapshot(): LibrarySnapshot;
  read(id: string): Promise<Document | undefined>;
  resolveDocument?(sourceId: string, file: string): Promise<string | undefined>;
  resolveAsset?(
    sourceId: string,
    file: string,
  ): Promise<{ file: string; type: string } | undefined>;
}
interface Position {
  top: number;
  horizontal: number;
  activeTarget: string | null;
}
interface Location {
  id: string;
  position: Position;
}
export interface SessionSnapshot {
  state: State;
  entries: DocumentEntry[];
  layout: Layout;
  panel: 'search' | 'outline' | null;
  draft: string;
  query: string;
  matches: Match[];
  matchIndex: number;
  outlineCursor: number;
  notice: string | null;
  noticeKind: 'info' | 'error';
}
const clamp = (value: number, max: number) => Math.max(0, Math.min(value, max));
const position = (state: State): Position => ({
  top: state.top,
  horizontal: state.horizontal,
  activeTarget: state.activeTarget,
});

export class Session {
  private value: SessionSnapshot;
  private width = 54;
  private page = 20;
  private epoch = 0;
  private disposed = false;
  private listeners = new Set<() => void>();
  private positions = new Map<string, Position>();
  private past: Location[] = [];
  private future: Location[] = [];
  private pendingTask: Promise<void> = Promise.resolve();
  private imageEpoch = 0;
  private imageRequest: number | undefined;

  constructor(
    private readonly reader: Reader,
    private readonly imageOpener?: ImageOpener,
  ) {
    this.value = {
      state: initialState(),
      entries: reader.snapshot().documents,
      layout: { lines: [], targets: [] },
      panel: null,
      draft: '',
      query: '',
      matches: [],
      matchIndex: -1,
      outlineCursor: 0,
      notice: null,
      noticeKind: 'info',
    };
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(changes: Partial<SessionSnapshot>) {
    if (this.disposed) return;
    this.value = {
      ...this.value,
      ...changes,
      ...(changes.notice !== undefined && changes.noticeKind === undefined
        ? {
            noticeKind: changes.notice ? ('error' as const) : ('info' as const),
          }
        : {}),
    };
    for (const listener of this.listeners) listener();
  }
  private context() {
    return {
      count: this.value.entries.length,
      lines: this.value.layout.lines.length,
      page: this.page,
      targets: this.value.layout.targets,
      width: this.width,
      maxWidth: this.value.layout.lines.reduce(
        (n, line) => Math.max(n, line.tableWidth ?? 0),
        this.width,
      ),
    };
  }
  configure(width: number, page: number) {
    if (this.width === width && this.page === page) return;
    this.width = width;
    this.page = page;
    this.reflow();
  }
  private reflow() {
    const document = this.value.state.document;
    const layout = document
      ? renderTerminalMarkdown(document.source, this.width)
      : { lines: [], targets: [] };
    this.value = {
      ...this.value,
      layout,
      matches: findMatches(layout, this.value.query),
    };
    const state = reduce(this.value.state, { type: 'resize' }, this.context());
    this.update({
      state,
      outlineCursor: clamp(
        this.value.outlineCursor,
        layout.targets.filter((t) => t.kind === 'heading').length - 1,
      ),
      matchIndex: this.value.matches.length
        ? Math.min(this.value.matchIndex, this.value.matches.length - 1)
        : -1,
    });
    if (this.value.matchIndex >= 0)
      this.reveal(this.value.matches[this.value.matchIndex]!);
  }
  send(event: Event) {
    if (this.disposed) return;
    this.imageEpoch++;
    const state = reduce(this.value.state, event, this.context());
    if (this.value.state.pending !== null && state.pending === null)
      this.epoch++;
    this.update({
      state,
      notice: null,
      ...(['move', 'horizontal', 'tab'].includes(event.type)
        ? { matchIndex: -1 }
        : {}),
    });
  }
  private reveal(
    point: { row: number; column?: number; tableWidth?: number },
    targetId: string | null = null,
  ) {
    const state = this.value.state;
    let horizontal = state.horizontal;
    if (point.column !== undefined && point.tableWidth !== undefined) {
      horizontal = clamp(horizontal, point.tableWidth - this.width);
      if (point.column < horizontal) horizontal = point.column;
      else if (point.column + 2 > horizontal + this.width)
        horizontal = point.column + 2 - this.width;
      horizontal = clamp(horizontal, point.tableWidth - this.width);
    }
    this.update({
      state: {
        ...state,
        top: clamp(point.row, this.value.layout.lines.length - this.page),
        horizontal,
        activeTarget: targetId,
      },
    });
  }
  beginSearch() {
    this.imageEpoch++;
    if (this.value.state.mode === 'read')
      this.update({ panel: 'search', draft: this.value.query, notice: null });
  }
  editSearch(input: string, remove = false) {
    if (this.value.panel !== 'search') return;
    const units = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
        this.value.draft,
      ),
    ];
    const draft = remove
      ? units
          .slice(0, -1)
          .map((s) => s.segment)
          .join('')
      : this.value.draft + safeText(input).replaceAll('\n', '');
    this.update({ draft });
  }
  commitSearch() {
    if (this.value.panel !== 'search') return;
    const query = this.value.draft;
    const matches = findMatches(this.value.layout, query);
    const index = matches.findIndex((m) => m.row >= this.value.state.top);
    this.update({
      panel: null,
      query,
      matches,
      matchIndex: matches.length ? Math.max(0, index) : -1,
      notice: query && !matches.length ? 'No matches (0/0).' : null,
    });
    if (matches.length) this.reveal(matches[this.value.matchIndex]!);
  }
  nextMatch(delta: number) {
    this.imageEpoch++;
    const { matches, matchIndex, state } = this.value;
    if (state.mode !== 'read' || !matches.length) return;
    let index;
    if (matchIndex < 0) {
      index =
        delta > 0
          ? matches.findIndex((m) => m.row >= state.top)
          : matches.findLastIndex((m) => m.row <= state.top);
      if (index < 0) index = delta > 0 ? 0 : matches.length - 1;
    } else index = (matchIndex + delta + matches.length) % matches.length;
    this.update({ matchIndex: index, notice: null });
    this.reveal(matches[index]!);
  }
  beginOutline() {
    this.imageEpoch++;
    if (this.value.state.mode === 'read') {
      const headings = this.headings();
      const cursor = Math.max(
        0,
        headings.findLastIndex((t) => t.row <= this.value.state.top),
      );
      this.update({ panel: 'outline', outlineCursor: cursor, notice: null });
    }
  }
  private headings() {
    return this.value.layout.targets.filter((t) => t.kind === 'heading');
  }
  movePanel(delta: number) {
    this.update({
      outlineCursor: clamp(
        this.value.outlineCursor + delta,
        this.headings().length - 1,
      ),
    });
  }
  chooseHeading() {
    const target = this.headings()[this.value.outlineCursor];
    this.update({ panel: null, matchIndex: -1 });
    if (target) this.reveal(target, target.id);
  }
  cancelPanel() {
    this.update({ panel: null });
  }
  activate(): Promise<void> {
    const target = this.value.layout.targets.find(
      (t) => t.id === this.value.state.activeTarget,
    );
    if (target?.kind === 'image') return this.activateImage(target);
    if (target?.kind === 'link') return this.follow(target.href ?? '');
    if (target) this.reveal(target, target.id);
    return Promise.resolve();
  }
  private async activateImage(target: Target): Promise<void> {
    const document = this.value.state.document;
    if (
      this.disposed ||
      !document ||
      this.value.state.mode !== 'read' ||
      this.value.panel ||
      this.value.state.pending !== null ||
      this.imageRequest === this.imageEpoch
    )
      return;
    const request = ++this.imageEpoch;
    this.imageRequest = request;
    const epoch = this.epoch;
    const current = () =>
      !this.disposed &&
      request === this.imageEpoch &&
      epoch === this.epoch &&
      this.value.state.document === document &&
      this.value.state.activeTarget === target.id &&
      this.value.state.mode === 'read' &&
      !this.value.panel;
    try {
      const file = imagePath(target.href ?? '');
      if (!this.imageOpener)
        throw new Error('Cannot open image: no image launcher is available.');
      const resolveAsset = async () => {
        try {
          return await this.reader.resolveAsset?.(document.entry.id, file);
        } catch {
          throw new Error('Cannot open image. Check file permissions.');
        }
      };
      const asset = await resolveAsset();
      if (!current()) return;
      if (!asset)
        throw new Error(
          'Cannot open image: unavailable, unsupported, or outside the selected targets.',
        );
      const verified = await resolveAsset();
      if (!current()) return;
      if (
        !verified ||
        verified.file !== asset.file ||
        verified.type !== asset.type
      )
        throw new Error('Cannot open image: the file changed before opening.');
      let failed = false;
      await this.imageOpener(verified.file, (message) => {
        failed = true;
        if (current())
          this.update({
            notice: safeText(message).replaceAll('\n', ' '),
            noticeKind: 'error',
          });
      });
      if (current() && !failed)
        this.update({
          notice: `Requested image viewer: ${target.label.replaceAll('\n', ' ')}`,
          noticeKind: 'info',
        });
    } catch (error) {
      if (current())
        this.update({
          notice:
            error instanceof Error
              ? safeText(error.message)
              : 'Cannot open image.',
          noticeKind: 'error',
        });
    } finally {
      if (this.imageRequest === request) this.imageRequest = undefined;
    }
  }
  open(id: string) {
    return this.navigate(async () => ({ id }), 'open');
  }
  follow(href: string) {
    const source = this.value.state.document?.entry.id;
    if (!source) return Promise.resolve();
    return this.navigate(async () => {
      const { file, anchor } = parseLink(href);
      const id = file
        ? await this.reader.resolveDocument?.(source, file)
        : source;
      if (!id)
        throw new Error(
          'This document is outside your targets or unavailable. Add it with -t.',
        );
      return { id, anchor };
    }, 'follow');
  }
  back() {
    const destination = this.past.at(-1);
    return destination
      ? this.navigate(async () => destination, 'back')
      : Promise.resolve();
  }
  forward() {
    const destination = this.future.at(-1);
    return destination
      ? this.navigate(async () => destination, 'forward')
      : Promise.resolve();
  }
  private navigate(
    resolve: () => Promise<{
      id: string;
      anchor?: string;
      position?: Position;
    }>,
    intent: 'open' | 'follow' | 'back' | 'forward' | 'refresh',
  ) {
    this.imageEpoch++;
    const request = ++this.epoch;
    const oldMode = this.value.state.mode;
    this.update({
      state: { ...this.value.state, pending: request, error: null },
      notice: null,
    });
    const task = (async () => {
      try {
        const destination = await resolve();
        if (this.disposed || request !== this.epoch) return;
        const document = await this.reader.read(destination.id).catch(() => {
          throw new Error('Cannot read document. Check file permissions.');
        });
        if (this.disposed || request !== this.epoch) return;
        if (!document)
          throw new Error(
            'Cannot read document. It may have been removed or replaced.',
          );
        const previous = this.value.state;
        const origin = previous.document
          ? { id: previous.document.entry.id, position: position(previous) }
          : undefined;
        if (origin) this.positions.set(origin.id, origin.position);
        if (intent === 'back') {
          this.past.pop();
          if (origin) this.future.push(origin);
        } else if (intent === 'forward') {
          this.future.pop();
          if (origin) this.past.push(origin);
        } else if (
          intent !== 'refresh' &&
          origin &&
          (intent === 'follow' || origin.id !== destination.id)
        ) {
          this.past.push(origin);
          this.future = [];
        }
        const restored =
          intent === 'refresh'
            ? position(previous)
            : (destination.position ??
              this.positions.get(destination.id) ?? {
                top: 0,
                horizontal: 0,
                activeTarget: null,
              });
        const same = previous.document?.entry.id === destination.id;
        this.value = {
          ...this.value,
          state: {
            ...previous,
            ...restored,
            cursor:
              intent === 'refresh'
                ? previous.cursor
                : Math.max(
                    0,
                    this.value.entries.findIndex(
                      (entry) => entry.id === destination.id,
                    ),
                  ),
            document,
            mode: intent === 'refresh' ? oldMode : 'read',
            pending: null,
            error: null,
            activeTarget: intent === 'refresh' ? null : restored.activeTarget,
          },
          panel: intent === 'refresh' ? this.value.panel : null,
          ...(intent !== 'refresh' ? { matchIndex: -1 } : {}),
          ...(!same
            ? { query: '', draft: '', matches: [], matchIndex: -1 }
            : {}),
        };
        this.reflow();
        if (intent !== 'refresh')
          this.update({
            state: { ...this.value.state, mode: 'read' },
            matchIndex: -1,
          });
        if (destination.anchor) {
          const target = this.value.layout.targets.find(
            (t) => t.kind === 'heading' && t.anchor === destination.anchor,
          );
          if (target) this.reveal(target, target.id);
          else
            this.update({
              state: {
                ...this.value.state,
                top: 0,
                horizontal: 0,
                activeTarget: null,
              },
              notice: `Heading not found: ${safeText(destination.anchor)}`,
            });
        }
      } catch (error) {
        if (this.disposed || request !== this.epoch) return;
        const message =
          error instanceof Error ? error.message : 'Cannot read document.';
        this.update({
          state: {
            ...this.value.state,
            pending: null,
            error: null,
            mode: intent === 'open' ? 'list' : this.value.state.mode,
          },
          notice: message,
        });
      }
    })();
    this.pendingTask = task;
    return task;
  }
  async changed(error?: string) {
    if (error) {
      this.update({ notice: error });
      return;
    }
    while (this.value.state.pending !== null && !this.disposed)
      await this.pendingTask;
    if (this.disposed) return;
    const entries = this.reader.snapshot().documents;
    const selected = this.value.entries[this.value.state.cursor]?.id;
    const index = entries.findIndex((e) => e.id === selected);
    this.update({
      entries,
      state: {
        ...this.value.state,
        cursor:
          index >= 0
            ? index
            : clamp(this.value.state.cursor, entries.length - 1),
      },
    });
    const id = this.value.state.document?.entry.id;
    if (id) await this.navigate(async () => ({ id }), 'refresh');
  }
  dispose() {
    this.imageEpoch++;
    this.disposed = true;
    this.epoch++;
    this.listeners.clear();
  }
}
