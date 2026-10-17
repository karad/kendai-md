import type { DocumentEntry } from '../types.js';
export interface Document {
  entry: DocumentEntry;
  source: string;
}
export interface State {
  mode: 'list' | 'read';
  activeTarget: string | null;
  cursor: number;
  top: number;
  horizontal: number;
  document: Document | null;
  pending: number | null;
  error: string | null;
}
export interface Context {
  count: number;
  lines: number;
  page: number;
  targets?: { id: string; row: number; column?: number; tableWidth?: number }[];
  width?: number;
  maxWidth?: number;
}
export type Event =
  | { type: 'move'; delta: number }
  | { type: 'horizontal'; delta: number }
  | { type: 'escape' }
  | { type: 'tab'; reverse?: boolean }
  | { type: 'resize' }
  | { type: 'load'; request: number }
  | { type: 'loaded'; request: number; document: Document }
  | { type: 'failed'; request: number; error: string };
export const initialState = (): State => ({
  mode: 'list',
  activeTarget: null,
  cursor: 0,
  top: 0,
  horizontal: 0,
  document: null,
  pending: null,
  error: null,
});
const clamp = (n: number, maximum: number) => Math.max(0, Math.min(n, maximum));
export function reduce(state: State, event: Event, context: Context): State {
  if (event.type === 'loaded' || event.type === 'failed') {
    if (state.pending !== event.request) return state;
    return event.type === 'loaded'
      ? {
          ...state,
          pending: null,
          mode: 'read',
          activeTarget: null,
          document: event.document,
          top: 0,
          horizontal: 0,
          error: null,
        }
      : { ...state, pending: null, mode: 'list', error: event.error };
  }
  if (event.type === 'escape') return { ...state, mode: 'list', pending: null };
  if (event.type === 'load') {
    return context.count > 0 && state.mode === 'list'
      ? { ...state, pending: event.request, error: null }
      : state;
  }
  const cursor = clamp(state.cursor, context.count - 1);
  const top = clamp(state.top, context.lines - context.page);
  const width = context.width ?? 2;
  const horizontal = clamp(
    state.horizontal,
    (context.maxWidth ?? width) - width,
  );
  const reveal = (target: NonNullable<Context['targets']>[number]) => {
    if (target.column === undefined || target.tableWidth === undefined)
      return horizontal;
    const current = clamp(horizontal, target.tableWidth - width);
    const next =
      target.column < current
        ? target.column
        : target.column + 2 > current + width
          ? target.column + 2 - width
          : current;
    return clamp(next, target.tableWidth - width);
  };
  if (event.type === 'horizontal') {
    return state.mode === 'read' && (context.maxWidth ?? width) > width
      ? {
          ...state,
          horizontal: clamp(
            horizontal + event.delta,
            (context.maxWidth ?? width) - width,
          ),
          activeTarget: null,
        }
      : state;
  }
  if (event.type === 'tab') {
    if (state.mode !== 'read') return state;
    const targets = context.targets ?? [];
    const current = targets.findIndex((t) => t.id === state.activeTarget);
    const next =
      current >= 0
        ? current + (event.reverse ? -1 : 1)
        : event.reverse
          ? targets.findLastIndex((t) => t.row <= top)
          : targets.findIndex((t) => t.row >= top);
    const target = targets[next];
    return target
      ? {
          ...state,
          activeTarget: target.id,
          top: clamp(target.row, context.lines - context.page),
          horizontal: reveal(target),
        }
      : state;
  }
  if (event.type === 'resize') {
    const target = context.targets?.find((t) => t.id === state.activeTarget);
    const activeTarget = target ? target.id : null;
    const visibleTop = target
      ? target.row < top
        ? target.row
        : target.row >= top + context.page
          ? target.row - context.page + 1
          : top
      : top;
    const nextTop = clamp(visibleTop, context.lines - context.page);
    const nextHorizontal = target ? reveal(target) : horizontal;
    return state.cursor === cursor &&
      state.top === nextTop &&
      state.horizontal === nextHorizontal &&
      state.activeTarget === activeTarget
      ? state
      : {
          ...state,
          cursor,
          top: nextTop,
          horizontal: nextHorizontal,
          activeTarget,
        };
  }
  if (state.mode === 'list')
    return {
      ...state,
      cursor: clamp(cursor + event.delta, context.count - 1),
      pending: null,
      error: null,
    };
  return {
    ...state,
    top: clamp(top + event.delta, context.lines - context.page),
    activeTarget: null,
  };
}
