import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, reduce, type Context } from '../src/tui/model.js';
const context: Context = { count: 1000, lines: 10000, page: 20 };
const document = {
  entry: { id: 'a', name: 'a.md', path: 'a.md' },
  source: 'hello',
};
test('starts with an empty preview and moves candidates without opening', () => {
  const start = initialState();
  assert.equal(start.mode, 'list');
  assert.equal(start.document, null);
  let s = reduce(start, { type: 'move', delta: 20 }, context);
  assert.equal(s.cursor, 20);
  assert.equal(s.document, null);
  s = reduce(s, { type: 'move', delta: 10000 }, context);
  assert.equal(s.cursor, 999);
  assert.equal(reduce(s, { type: 'move', delta: -10000 }, context).cursor, 0);
});
test('accepts only the current read request and keeps preview on failure', () => {
  let s = reduce(initialState(), { type: 'load', request: 1 }, context);
  s = reduce(s, { type: 'load', request: 2 }, context);
  assert.equal(
    reduce(s, { type: 'loaded', request: 1, document }, context).document,
    null,
  );
  s = reduce(s, { type: 'loaded', request: 2, document }, context);
  assert.equal(s.mode, 'read');
  s = reduce(s, { type: 'escape' }, context);
  s = reduce(s, { type: 'load', request: 3 }, context);
  s = reduce(s, { type: 'failed', request: 3, error: 'Cannot read' }, context);
  assert.equal(s.mode, 'list');
  assert.equal(s.document, document);
  assert.equal(s.error, 'Cannot read');
});
test('selection and Escape cancel pending reads and empty lists cannot load', () => {
  let s = reduce(initialState(), { type: 'load', request: 1 }, context);
  s = reduce(s, { type: 'move', delta: 1 }, context);
  assert.equal(s.pending, null);
  assert.equal(
    reduce(s, { type: 'loaded', request: 1, document }, context).mode,
    'list',
  );
  s = reduce(s, { type: 'load', request: 2 }, context);
  assert.equal(reduce(s, { type: 'escape' }, context).pending, null);
  assert.equal(
    reduce(
      initialState(),
      { type: 'load', request: 1 },
      { ...context, count: 0 },
    ).pending,
    null,
  );
});
test('clamps long documents and preserves position on Escape, resets after reopening', () => {
  let s = reduce(initialState(), { type: 'load', request: 1 }, context);
  s = reduce(s, { type: 'loaded', request: 1, document }, context);
  s = reduce(s, { type: 'move', delta: 100000 }, context);
  assert.equal(s.top, 9980);
  s = reduce(s, { type: 'escape' }, context);
  assert.equal(s.top, 9980);
  s = reduce(s, { type: 'load', request: 2 }, context);
  s = reduce(s, { type: 'loaded', request: 2, document }, context);
  assert.equal(s.top, 0);
  s = reduce(s, { type: 'move', delta: 100 }, context);
  s = reduce(s, { type: 'resize' }, { ...context, lines: 30 });
  assert.equal(s.top, 10);
});

test('Tab is disabled in files and advances same-line targets in document order', () => {
  const targets = [
    { id: 'h', row: 0 },
    { id: 'a', row: 0 },
    { id: 'b', row: 40 },
  ];
  const c = { ...context, targets };
  assert.equal(reduce(initialState(), { type: 'tab' }, c).activeTarget, null);
  let s = reduce(initialState(), { type: 'load', request: 1 }, c);
  s = reduce(s, { type: 'loaded', request: 1, document }, c);
  s = reduce(s, { type: 'tab' }, c);
  assert.equal(s.activeTarget, 'h');
  s = reduce(s, { type: 'tab' }, c);
  assert.equal(s.activeTarget, 'a');
  s = reduce(s, { type: 'tab' }, c);
  assert.equal(s.activeTarget, 'b');
  assert.equal(s.top, 40);
  assert.equal(reduce(s, { type: 'tab' }, c).activeTarget, 'b');
});
test('Tab uses the viewport start, resets on movement and loading, and survives reflow', () => {
  const c = {
    ...context,
    targets: [
      { id: 'h', row: 0 },
      { id: 'a', row: 30 },
    ],
  };
  let s = reduce(initialState(), { type: 'load', request: 1 }, c);
  s = reduce(s, { type: 'loaded', request: 1, document }, c);
  s = reduce(s, { type: 'move', delta: 10 }, c);
  s = reduce(s, { type: 'tab' }, c);
  assert.equal(s.activeTarget, 'a');
  s = reduce(
    s,
    { type: 'resize' },
    {
      ...c,
      targets: [
        { id: 'h', row: 0 },
        { id: 'a', row: 100 },
      ],
    },
  );
  assert.equal(s.activeTarget, 'a');
  assert.equal(s.top, 81);
  s = reduce(s, { type: 'move', delta: 0 }, c);
  assert.equal(s.activeTarget, null);
  assert.equal(
    reduce(s, { type: 'tab' }, { ...c, targets: [] }).activeTarget,
    null,
  );
  s = reduce({ ...s, top: 0 }, { type: 'tab' }, c);
  s = reduce(s, { type: 'escape' }, c);
  s = reduce(s, { type: 'load', request: 2 }, c);
  assert.equal(
    reduce(s, { type: 'loaded', request: 2, document }, c).activeTarget,
    null,
  );
});

test('horizontal movement is reading-only, bounded and resets only on successful open', () => {
  const c = { ...context, width: 20, maxWidth: 60 };
  let s = initialState();
  assert.equal(reduce(s, { type: 'horizontal', delta: 4 }, c).horizontal, 0);
  s = reduce(s, { type: 'load', request: 1 }, c);
  s = reduce(s, { type: 'loaded', request: 1, document }, c);
  s = reduce(s, { type: 'horizontal', delta: 999 }, c);
  assert.equal(s.horizontal, 40);
  s = reduce(s, { type: 'escape' }, c);
  assert.equal(s.horizontal, 40);
  s = reduce(s, { type: 'load', request: 2 }, c);
  s = reduce(s, { type: 'failed', request: 2, error: 'missing' }, c);
  assert.equal(s.horizontal, 40);
  s = reduce(s, { type: 'load', request: 3 }, c);
  s = reduce(s, { type: 'loaded', request: 3, document }, c);
  assert.equal(s.horizontal, 0);
  assert.equal(
    reduce({ ...s, horizontal: 40 }, { type: 'resize' }, { ...c, maxWidth: 30 })
      .horizontal,
    10,
  );
  assert.equal(reduce(s, { type: 'horizontal', delta: -4 }, c).horizontal, 0);
});

test('Tab and resize reveal table target starts and adapt to a narrower table', () => {
  const c = {
    ...context,
    width: 20,
    maxWidth: 100,
    targets: [
      { id: 'a', row: 30, column: 80, tableWidth: 100 },
      { id: 'b', row: 32, column: 4, tableWidth: 30 },
    ],
  };
  let s: ReturnType<typeof initialState> = { ...initialState(), mode: 'read' };
  s = reduce(s, { type: 'tab' }, c);
  assert.equal(s.top, 30);
  assert.equal(s.horizontal, 62);
  assert.equal(s.activeTarget, 'a');
  s = reduce(s, { type: 'resize' }, { ...c, width: 40 });
  assert.equal(s.horizontal, 60);
  s = reduce(s, { type: 'tab' }, c);
  assert.equal(s.horizontal, 4);
  assert.equal(s.activeTarget, 'b');
  s = reduce(s, { type: 'horizontal', delta: 4 }, c);
  assert.equal(s.activeTarget, null);
});

test('horizontal keys do nothing for documents without wide tables', () => {
  const s = {
    ...initialState(),
    mode: 'read' as const,
    activeTarget: 'heading',
  };
  assert.equal(
    reduce(
      s,
      { type: 'horizontal', delta: 4 },
      { ...context, width: 54, maxWidth: 54 },
    ),
    s,
  );
});

test('Shift+Tab reverses same-line targets, reveals tables and stops at the first target', () => {
  const c = {
    ...context,
    width: 20,
    maxWidth: 100,
    targets: [
      { id: 'h', row: 0 },
      { id: 'a', row: 0, column: 80, tableWidth: 100 },
      { id: 'b', row: 40 },
    ],
  };
  const reverse = { type: 'tab', reverse: true } as const;
  assert.equal(reduce(initialState(), reverse, c).activeTarget, null);
  let s: ReturnType<typeof initialState> = {
    ...initialState(),
    mode: 'read' as 'list' | 'read',
    activeTarget: 'b',
    top: 40,
  };
  s = reduce(s, reverse, c);
  assert.equal(s.activeTarget, 'a');
  assert.equal(s.top, 0);
  assert.equal(s.horizontal, 62);
  s = reduce(s, reverse, c);
  assert.equal(s.activeTarget, 'h');
  assert.equal(reduce(s, reverse, c), s);
});
test('Shift+Tab without selection uses the last target at or before the viewport start', () => {
  const c = {
    ...context,
    targets: [
      { id: 'a', row: 10 },
      { id: 'b', row: 10 },
      { id: 'c', row: 40 },
    ],
  };
  const reverse = { type: 'tab', reverse: true } as const;
  const s = { ...initialState(), mode: 'read' as const };
  assert.equal(reduce(s, reverse, c), s);
  assert.equal(reduce({ ...s, top: 10 }, reverse, c).activeTarget, 'b');
  assert.equal(reduce({ ...s, top: 30 }, reverse, c).activeTarget, 'b');
  assert.equal(reduce({ ...s, top: 50 }, reverse, c).activeTarget, 'c');
  assert.equal(reduce(s, reverse, { ...c, targets: [] }), s);
});
