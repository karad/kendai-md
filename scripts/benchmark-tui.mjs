import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdtemp, realpath, writeFile, rm } from 'node:fs/promises';
import { tmpdir, release } from 'node:os';
import path from 'node:path';
import { Library } from '../dist/library.js';
import { Session } from '../dist/tui/session.js';
import { highlightLine } from '../dist/tui/navigation.js';
import { clipTableLine } from '../dist/tui/table.js';

const temporary = await realpath(
  await mkdtemp(path.join(tmpdir(), 'kendai-tui-benchmark-')),
);
const files = 1000,
  width = 54,
  page = 20,
  operations = 100;
const lines = Array.from({ length: 10000 }, (_, i) =>
  i % 2
    ? ''
    : i % 500 === 0
      ? `## Section ${i}`
      : `Line ${i}: 日本語 needle e\u0301 😀 [Guide](./guide.md)`,
);
for (let i = 200; i < lines.length; i += 1000)
  lines.splice(
    i,
    4,
    '| Name | Value |',
    '|---|---|',
    '| 日本語 | needle |',
    '',
  );
lines.splice(400, 4, '```ts', 'const needle = 1;', '```', '');
const source = lines.join('\n');
let session;
try {
  await writeFile(path.join(temporary, '000-large.md'), source);
  for (let first = 1; first < files; first += 50)
    await Promise.all(
      Array.from({ length: Math.min(50, files - first) }, (_, i) =>
        writeFile(
          path.join(
            temporary,
            `document-${String(first + i).padStart(4, '0')}.md`,
          ),
          '# Small document',
        ),
      ),
    );
  const memoryBefore = process.memoryUsage();
  let start = performance.now();
  const library = await Library.create(['.'], temporary);
  const scanMs = performance.now() - start;
  session = new Session(library);
  session.configure(width, page);
  assert.equal(session.snapshot().entries.length, files);
  const entry = session
    .snapshot()
    .entries.find((e) => e.name === '000-large.md');
  assert.ok(entry);
  start = performance.now();
  await session.open(entry.id);
  const openMs = performance.now() - start;
  assert.equal(session.snapshot().state.document?.source, source);
  start = performance.now();
  session.beginSearch();
  session.editSearch('needle');
  session.commitSearch();
  const searchMs = performance.now() - start;
  assert.ok(session.snapshot().matches.length > 4000);
  const initialTop = session.snapshot().state.top,
    samples = [];
  for (let i = 0; i < operations; i++) {
    start = performance.now();
    session.send({ type: 'move', delta: i < operations / 2 ? page : -page });
    const snapshot = session.snapshot();
    snapshot.layout.lines
      .slice(snapshot.state.top, snapshot.state.top + page)
      .map((line, j) =>
        clipTableLine(
          highlightLine(
            line,
            snapshot.state.top + j,
            snapshot.matches,
            snapshot.matchIndex,
          ),
          snapshot.state.horizontal,
          width,
        ),
      );
    samples.push(performance.now() - start);
  }
  assert.equal(session.snapshot().state.top, initialTop);
  samples.sort((a, b) => a - b);
  const memoryAfter = process.memoryUsage();
  const movementP95Ms = samples[Math.ceil(samples.length * 0.95) - 1];
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        osRelease: release(),
        files,
        sourceLines: source.split('\n').length,
        sourceBytes: Buffer.byteLength(source),
        displayLines: session.snapshot().layout.lines.length,
        targets: session.snapshot().layout.targets.length,
        matches: session.snapshot().matches.length,
        width,
        page,
        operations,
        scanMs,
        openMs,
        searchMs,
        movementMedianMs: samples[Math.floor(samples.length / 2)],
        movementP95Ms,
        movementMaxMs: samples.at(-1),
        memory: {
          rssBeforeBytes: memoryBefore.rss,
          heapBeforeBytes: memoryBefore.heapUsed,
          rssAfterBytes: memoryAfter.rss,
          heapAfterBytes: memoryAfter.heapUsed,
          maxRssKiB: process.resourceUsage().maxRSS,
        },
        includesViewportHighlightAndClip: true,
        includesReactRender: false,
        includesTerminalPaint: false,
        referenceTargets: { scanOpenSearchMs: 5000, movementP95Ms: 50 },
        withinReferenceTargets:
          scanMs < 5000 &&
          openMs < 5000 &&
          searchMs < 5000 &&
          movementP95Ms < 50,
      },
      null,
      2,
    ),
  );
} finally {
  session?.dispose();
  await rm(temporary, { recursive: true, force: true });
}
