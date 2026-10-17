import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Box, Text, useApp, useInput, useWindowSize } from 'ink';
import { Session, type Reader } from './session.js';
import { highlightLine } from './navigation.js';
import type { ChangeSource } from './watch.js';
import { safeText } from './text.js';
import { clipTableLine } from './table.js';
import type { ImageOpener } from './images.js';

const label = (text: string) => safeText(text).replaceAll('\n', ' ');

export function App({
  library,
  size,
  changes,
  imageOpener,
}: {
  library: Reader;
  changes?: ChangeSource;
  imageOpener?: ImageOpener;
  size?: { columns: number; rows: number };
}) {
  const detected = useWindowSize();
  const { columns, rows } = size ?? detected;
  const { exit } = useApp();
  const session = useMemo(
    () => new Session(library, imageOpener),
    [library, imageOpener],
  );
  const snapshot = useSyncExternalStore(session.subscribe, session.snapshot);
  const {
    state,
    entries,
    layout,
    panel,
    draft,
    query,
    matches,
    matchIndex,
    outlineCursor,
    notice,
    noticeKind,
  } = snapshot;
  const page = Math.max(1, rows - 4);
  const left = Math.max(24, Math.floor(columns * 0.3));
  const width = Math.max(2, columns - left - 2);
  const lines = layout.lines;
  const maxWidth = lines.reduce(
    (n, line) => Math.max(n, line.tableWidth ?? 0),
    width,
  );
  const headings = layout.targets.filter((t) => t.kind === 'heading');
  useEffect(() => {
    session.configure(width, page);
  }, [session, width, page]);
  useEffect(() => () => session.dispose(), [session]);
  useEffect(
    () => changes?.subscribe((error) => session.changed(error)),
    [session, changes],
  );
  useInput((input, key) => {
    const small = columns < 80 || rows < 24;
    if (
      (key.ctrl && input === 'c') ||
      (input === 'q' && (small || panel !== 'search'))
    ) {
      session.dispose();
      exit();
      return;
    }
    if (small) return;
    if (panel === 'search') {
      if (key.escape) session.cancelPanel();
      else if (key.return) session.commitSearch();
      else if (key.backspace || key.delete) session.editSearch('', true);
      else if (
        !key.ctrl &&
        !key.meta &&
        !key.upArrow &&
        !key.downArrow &&
        !key.leftArrow &&
        !key.rightArrow &&
        !key.tab &&
        !key.pageUp &&
        !key.pageDown
      )
        session.editSearch(input);
      return;
    }
    const delta = key.upArrow
      ? -1
      : key.downArrow
        ? 1
        : key.pageUp
          ? -page
          : key.pageDown
            ? page
            : 0;
    if (panel === 'outline') {
      if (key.escape) session.cancelPanel();
      else if (key.return) session.chooseHeading();
      else if (delta) session.movePanel(delta);
      return;
    }
    if (key.escape) {
      session.send({ type: 'escape' });
      return;
    }
    if (key.return) {
      if (state.mode === 'list') {
        const entry = entries[state.cursor];
        if (entry) void session.open(entry.id);
      } else void session.activate();
      return;
    }
    if (key.leftArrow || key.rightArrow) {
      session.send({ type: 'horizontal', delta: key.leftArrow ? -4 : 4 });
      return;
    }
    if (key.tab) {
      session.send({ type: 'tab', reverse: key.shift });
      return;
    }
    if (delta) {
      session.send({ type: 'move', delta });
      return;
    }
    if (state.mode !== 'read') return;
    if (input === '/') session.beginSearch();
    else if (input === 'g' || input === 'G')
      session.nextMatch(input === 'g' ? 1 : -1);
    else if (input === 'o') session.beginOutline();
    else if (input === '<') void session.back();
    else if (input === '>') void session.forward();
  });
  if (columns < 80 || rows < 24)
    return <Text>Minimum size: 80x24. Press q to quit.</Text>;
  const first = Math.max(0, state.cursor - page + 1);
  const top = Math.min(state.top, Math.max(0, lines.length - page));
  const activeIndex = layout.targets.findIndex(
    (t) => t.id === state.activeTarget,
  );
  const active = layout.targets[activeIndex];
  const horizontalStatus =
    maxWidth > width
      ? `Table X ${state.horizontal}/${maxWidth - width} | `
      : '';
  return (
    <Box width={columns} height={rows} flexDirection="column">
      <Box height={rows - 1}>
        <Box
          width={left}
          flexDirection="column"
          borderStyle="single"
          borderColor={state.mode === 'list' ? 'cyan' : 'gray'}
        >
          <Text bold>Files [{state.mode === 'list' ? 'active' : 'idle'}]</Text>
          {!entries.length && <Text>No Markdown files.</Text>}
          {entries.slice(first, first + page).map((entry, i) => (
            <Text
              key={entry.id}
              wrap="truncate-end"
              inverse={first + i === state.cursor}
            >
              {first + i === state.cursor ? '> ' : '  '}
              {label(entry.path)}
            </Text>
          ))}
        </Box>
        <Box
          width={columns - left}
          flexDirection="column"
          borderStyle="single"
          borderColor={state.mode === 'read' ? 'cyan' : 'gray'}
          overflow="hidden"
        >
          <Text bold wrap="truncate-end">
            Preview [{state.mode === 'read' ? 'active' : 'idle'}]
            {state.document ? ` ${label(state.document.entry.path)}` : ''}
          </Text>
          {panel === 'outline' ? (
            <>
              <Text bold>Headings — Enter: Jump Esc: Cancel</Text>
              {!headings.length && <Text>No headings.</Text>}
              {headings
                .slice(
                  Math.max(0, outlineCursor - page + 2),
                  Math.max(0, outlineCursor - page + 2) + page - 1,
                )
                .map((target) => (
                  <Text
                    key={target.id}
                    wrap="truncate-end"
                    inverse={headings[outlineCursor]?.id === target.id}
                  >
                    {'#'.repeat(target.level ?? 1)} {label(target.label)}
                  </Text>
                ))}
            </>
          ) : (
            lines.slice(top, top + page).map((original, i) => {
              const line = clipTableLine(
                highlightLine(original, top + i, matches, matchIndex),
                state.horizontal,
                width,
              );
              return (
                <Text key={i}>
                  {line.spans.length
                    ? line.spans.map((span, j) => {
                        const { text, target, ...style } = span;
                        return (
                          <Text
                            key={j}
                            {...style}
                            inverse={
                              state.mode === 'read' &&
                              target !== undefined &&
                              target === state.activeTarget
                            }
                          >
                            {text}
                          </Text>
                        );
                      })
                    : ' '}
                </Text>
              );
            })
          )}
        </Box>
      </Box>
      <Text
        wrap="truncate-end"
        color={
          state.error || (notice && noticeKind === 'error') ? 'red' : undefined
        }
      >
        {panel === 'search'
          ? `Search: /${label(draft)}  Enter: Find  Esc: Cancel`
          : (notice ??
            state.error ??
            (state.pending !== null
              ? 'Loading document...'
              : active && state.mode === 'read'
                ? `Target ${activeIndex + 1}/${layout.targets.length} ${active.kind}: ${label(active.label)} | ${horizontalStatus}Tab/Shift+Tab: Next/Prev  Esc: Files  q: Quit`
                : `${query ? `Find ${matchIndex + 1}/${matches.length} [g/G] | ` : ''}${horizontalStatus}${state.mode} ${top}/${Math.max(0, lines.length - page)} | Enter: Open  Esc: Files  Tab: Next  /: Find  o: Headings  </>: History  q: Quit`))}
      </Text>
    </Box>
  );
}
