import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, type Reader } from '../src/tui/session.js';
const entry = (id: string) => ({ id, name: `${id}.md`, path: `${id}.md` });
function reader(): Reader {
  const docs = {
    a:
      '# Start\n\n日本語\n\n日本語\n\n日本語\n\n' +
      'line\n\n'.repeat(50) +
      '## End',
    b: '# B\n\n## Section',
    c: '# C',
  };
  return {
    snapshot: () => ({
      project: 'test',
      targets: [],
      documents: Object.keys(docs).map(entry),
    }),
    read: async (id) =>
      id in docs
        ? { entry: entry(id), source: docs[id as keyof typeof docs] }
        : undefined,
    resolveDocument: async (_id, file) => file.replace('.md', ''),
  };
}
test('search cycles matches, cancels editing, handles q and jumps from outline', async () => {
  const s = new Session(reader());
  s.configure(54, 20);
  await s.open('a');
  s.beginSearch();
  s.editSearch('日本語');
  s.commitSearch();
  assert.equal(s.snapshot().matches.length, 3);
  s.nextMatch(1);
  assert.equal(s.snapshot().matchIndex, 1);
  s.nextMatch(-1);
  assert.equal(s.snapshot().matchIndex, 0);
  s.nextMatch(-1);
  assert.equal(s.snapshot().matchIndex, 2);
  s.beginSearch();
  s.editSearch('q');
  s.cancelPanel();
  assert.equal(s.snapshot().query, '日本語');
  s.beginOutline();
  s.movePanel(1);
  s.chooseHeading();
  assert.equal(
    s.snapshot().state.activeTarget,
    s.snapshot().layout.targets.filter((t) => t.kind === 'heading')[1]!.id,
  );
  assert.ok(s.snapshot().state.top > 20);
  s.configure(82, 20);
  assert.ok(s.snapshot().state.top > 0);
  s.dispose();
});
test('successful document navigation restores positions with back and forward branches', async () => {
  const s = new Session(reader());
  s.configure(20, 20);
  await s.open('a');
  s.send({ type: 'move', delta: 30 });
  await s.follow('b.md#section');
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  await s.follow('c.md');
  await s.back();
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  await s.forward();
  assert.equal(s.snapshot().state.document!.entry.id, 'c');
  await s.back();
  await s.back();
  assert.equal(s.snapshot().state.top, 30);
  await s.follow('b.md');
  await s.forward();
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  s.send({ type: 'escape' });
  await s.open('a');
  assert.equal(s.snapshot().state.top, 30);
  s.dispose();
});

test('failed links and missing history preserve the document and navigation stacks', async () => {
  const r = reader();
  const s = new Session(r);
  s.configure(54, 20);
  await s.open('a');
  await s.follow('b.md');
  await s.back();
  await s.follow('https://example.com');
  assert.equal(s.snapshot().state.document!.entry.id, 'a');
  await s.forward();
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  await s.follow('#absent');
  assert.match(s.snapshot().notice!, /Heading not found/);
  assert.equal(s.snapshot().state.top, 0);
  s.dispose();
});
test('late document reads cannot replace a newer request or a canceled selection', async () => {
  let finish!: (value: Awaited<ReturnType<Reader['read']>>) => void;
  const r = reader(),
    base = r.read;
  r.read = (id) =>
    id === 'a'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : base(id);
  const s = new Session(r);
  const first = s.open('a');
  await Promise.resolve();
  await s.open('b');
  finish({ entry: entry('a'), source: 'Stale' });
  await first;
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  s.send({ type: 'escape' });
  const late = s.open('a');
  await Promise.resolve();
  s.send({ type: 'move', delta: 1 });
  finish({ entry: entry('a'), source: 'Stale' });
  await late;
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  s.dispose();
});
test('watch updates preserve position, selection IDs and the old document on deletion', async () => {
  const r = reader(),
    s = new Session(r);
  s.configure(54, 20);
  await s.open('a');
  s.send({ type: 'move', delta: 30 });
  await s.changed();
  assert.equal(s.snapshot().state.top, 30);
  r.snapshot = () => ({
    project: 'test',
    targets: [],
    documents: [entry('b')],
  });
  r.read = async () => undefined;
  await s.changed();
  assert.equal(s.snapshot().entries.length, 1);
  assert.equal(s.snapshot().state.document!.entry.id, 'a');
  assert.match(s.snapshot().notice!, /Cannot read/);
  s.dispose();
});

test('refresh waits for manual navigation and does not steal list focus or the candidate', async () => {
  const r = reader(),
    base = r.read;
  let finish!: (value: Awaited<ReturnType<Reader['read']>>) => void;
  let slow = true;
  r.read = (id) =>
    id === 'b' && slow
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : base(id);
  const s = new Session(r);
  await s.open('a');
  const navigation = s.follow('b.md');
  await Promise.resolve();
  await Promise.resolve();
  const refresh = s.changed();
  slow = false;
  finish({ entry: entry('b'), source: '# Latest B' });
  await navigation;
  await refresh;
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  s.beginSearch();
  s.editSearch('B');
  s.commitSearch();
  s.send({ type: 'escape' });
  s.send({ type: 'move', delta: 1 });
  const candidate = s.snapshot().entries[s.snapshot().state.cursor]!.id;
  s.configure(82, 20);
  await s.changed();
  assert.equal(s.snapshot().state.mode, 'list');
  assert.equal(s.snapshot().entries[s.snapshot().state.cursor]!.id, candidate);
  s.dispose();
});
test('back and forward failures retain their history entries, including same-document anchors', async () => {
  const r = reader(),
    base = r.read,
    s = new Session(r);
  await s.open('a');
  s.send({ type: 'move', delta: 20 });
  await s.follow('#end');
  assert.ok(s.snapshot().state.top > 20);
  await s.back();
  assert.equal(s.snapshot().state.top, 20);
  await s.forward();
  assert.ok(s.snapshot().state.top > 20);
  await s.follow('b.md');
  r.read = async (id) => (id === 'a' ? undefined : base(id));
  await s.back();
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  r.read = base;
  await s.back();
  assert.equal(s.snapshot().state.document!.entry.id, 'a');
  r.read = async (id) => (id === 'b' ? undefined : base(id));
  await s.forward();
  assert.equal(s.snapshot().state.document!.entry.id, 'a');
  r.read = base;
  await s.forward();
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  s.dispose();
});
test('search reveals wide table matches and handles empty search, absent headings and grapheme deletion', async () => {
  const r = reader();
  r.read = async (id) => ({
    entry: entry(id),
    source:
      '| First | Second | Third | Fourth | Fifth | Sixth | Seventh | Eighth |\n|---|---|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 日本語 |',
  });
  const s = new Session(r);
  s.configure(20, 20);
  await s.open('a');
  s.beginOutline();
  s.chooseHeading();
  assert.equal(s.snapshot().panel, null);
  s.beginSearch();
  s.editSearch('😀');
  s.editSearch('', true);
  assert.equal(s.snapshot().draft, '');
  s.commitSearch();
  assert.equal(s.snapshot().matches.length, 0);
  s.beginSearch();
  s.editSearch('日本語');
  s.commitSearch();
  assert.ok(s.snapshot().state.horizontal > 0);
  s.configure(54, 20);
  assert.equal(s.snapshot().matchIndex, 0);
  s.beginSearch();
  s.editSearch('absent');
  s.commitSearch();
  assert.match(s.snapshot().notice!, /No matches/);
  s.dispose();
});

test('real relative links stay within selected documents and rereads reject replaced symlinks', async () => {
  const { mkdtemp, writeFile, mkdir, rm, symlink } =
    await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { Library } = await import('../src/library.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-links-'));
  try {
    await mkdir(path.join(dir, 'doc'));
    await writeFile(path.join(dir, 'a.md'), '# A');
    await writeFile(
      path.join(dir, 'doc', 'README.md'),
      '# 日本語\n\n## 日本語',
    );
    await writeFile(path.join(dir, 'secret.md'), 'PRIVATE');
    const library = await Library.create(['a.md', 'doc/'], dir),
      s = new Session(library);
    const id = library.snapshot().documents.find((e) => e.name === 'a.md')!.id;
    await s.open(id);
    await s.follow('doc/#%E6%97%A5%E6%9C%AC%E8%AA%9E-1');
    assert.equal(s.snapshot().state.document!.entry.name, 'README.md');
    assert.equal(
      s
        .snapshot()
        .layout.targets.find((t) => t.id === s.snapshot().state.activeTarget)!
        .anchor,
      '日本語-1',
    );
    await s.back();
    await s.follow('secret.md');
    assert.equal(s.snapshot().state.document!.entry.id, id);
    assert.match(s.snapshot().notice!, /outside your targets/);
    await rm(path.join(dir, 'doc', 'README.md'));
    await symlink(
      path.join(dir, 'secret.md'),
      path.join(dir, 'doc', 'README.md'),
    );
    await s.follow('doc/');
    assert.equal(s.snapshot().state.document!.entry.id, id);
    assert.ok(!s.snapshot().state.document!.source.includes('PRIVATE'));
    s.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('a slow refresh cannot replace a new manual document, and disposal ignores late results', async () => {
  const r = reader(),
    base = r.read,
    s = new Session(r);
  await s.open('a');
  let finish!: (value: Awaited<ReturnType<Reader['read']>>) => void;
  r.read = (id) =>
    id === 'a'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : base(id);
  const refreshing = s.changed();
  await Promise.resolve();
  await s.open('b');
  finish({ entry: entry('a'), source: 'Stale refresh' });
  await refreshing;
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
  const opening = s.open('a');
  await Promise.resolve();
  s.dispose();
  finish({ entry: entry('a'), source: 'Disposed' });
  await opening;
  assert.equal(s.snapshot().state.document!.entry.id, 'b');
});

test('image activation requests only selected images and preserves document position and history', async () => {
  const r = reader();
  r.read = async (id) => ({
    entry: entry(id),
    source: '# Start\n\n![図](./図%20one.png)\n\n[Next](b.md)',
  });
  r.resolveAsset = async () => ({ file: '/tmp/図 one.png', type: 'image/png' });
  const opened: string[] = [];
  let fail!: (message: string) => void;
  const s = new Session(r, async (file, onFailure) => {
    opened.push(file);
    fail = onFailure;
  });
  await s.open('a');
  assert.equal(opened.length, 0);
  s.send({ type: 'tab' });
  s.send({ type: 'tab' });
  const before = s.snapshot().state;
  await s.activate();
  assert.deepEqual(opened, ['/tmp/図 one.png']);
  assert.equal(s.snapshot().state, before);
  assert.equal(s.snapshot().noticeKind, 'info');
  fail('Cannot open image.');
  assert.match(s.snapshot().notice!, /Cannot open image/);
  assert.equal(s.snapshot().noticeKind, 'error');
  await s.back();
  assert.equal(s.snapshot().state.document!.entry.id, 'a');
  await s.activate();
  assert.equal(opened.length, 2);
  s.dispose();
});
test('image requests reject invalid sources and ignore selection changes and repeated Enter while resolving', async () => {
  const r = reader();
  r.read = async (id) => ({
    entry: entry(id),
    source:
      '![Local](./a.png) [Next](b.md) ![Remote](https://example.invalid/a.png)',
  });
  let resolve!: (asset: { file: string; type: string }) => void;
  r.resolveAsset = () =>
    new Promise((done) => {
      resolve = done;
    });
  let opens = 0;
  const s = new Session(r, async () => {
    opens++;
  });
  await s.open('a');
  s.send({ type: 'tab' });
  const pending = s.activate();
  await s.activate();
  s.send({ type: 'tab' });
  resolve({ file: '/tmp/a.png', type: 'image/png' });
  await pending;
  assert.equal(opens, 0);
  s.send({ type: 'tab' });
  await s.activate();
  assert.equal(opens, 0);
  assert.match(s.snapshot().notice!, /relative local image/);
  s.dispose();
});

test('real image resolution enforces selected roots, extensions, missing files and symlink boundaries', async () => {
  const { mkdtemp, mkdir, writeFile, rm, symlink, realpath } =
      await import('node:fs/promises'),
    { tmpdir } = await import('node:os'),
    path = await import('node:path'),
    { Library } = await import('../src/library.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-image-boundary-'));
  try {
    await mkdir(path.join(dir, 'docs', 'assets'), { recursive: true });
    const paths = [
      'assets/図%20one.png',
      'https://example.invalid/image.png',
      '../outside.png',
      '.hidden.png',
      'assets/no.txt',
      'assets/missing.png',
      'assets/escape.png',
    ];
    await writeFile(
      path.join(dir, 'docs', 'a.md'),
      paths.map((p, i) => `![Image${i}](${p})`).join('\n\n'),
    );
    await writeFile(path.join(dir, 'docs', 'assets', '図 one.png'), 'image');
    await writeFile(path.join(dir, 'outside.png'), 'outside');
    await writeFile(path.join(dir, 'docs', '.hidden.png'), 'hidden');
    await writeFile(path.join(dir, 'docs', 'assets', 'no.txt'), 'text');
    await symlink(
      path.join(dir, 'outside.png'),
      path.join(dir, 'docs', 'assets', 'escape.png'),
    );
    const library = await Library.create(['docs/'], dir),
      opened: string[] = [],
      s = new Session(library, async (file) => {
        opened.push(file);
      });
    await s.open(library.snapshot().documents[0]!.id);
    for (let i = 0; i < paths.length; i++) {
      s.send({ type: 'tab' });
      await s.activate();
    }
    assert.deepEqual(opened, [
      await realpath(path.join(dir, 'docs', 'assets', '図 one.png')),
    ]);
    assert.match(s.snapshot().notice!, /Cannot open image/);
    s.dispose();
    const explicit = await Library.create(['docs/a.md'], dir),
      sibling = new Session(explicit, async (file) => {
        opened.push(file);
      });
    await sibling.open(explicit.snapshot().documents[0]!.id);
    sibling.send({ type: 'tab' });
    await sibling.activate();
    assert.equal(opened.length, 2);
    sibling.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
for (const action of ['escape', 'document', 'search', 'dispose'] as const) {
  test(`image resolution is canceled on ${action}`, async () => {
    const r = reader();
    r.read = async (id) => ({ entry: entry(id), source: '![Image](./a.png)' });
    let finish!: (asset: { file: string; type: string }) => void;
    r.resolveAsset = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    let opened = 0;
    const s = new Session(r, async () => {
      opened++;
    });
    await s.open('a');
    s.send({ type: 'tab' });
    const pending = s.activate();
    if (action === 'escape') s.send({ type: 'escape' });
    else if (action === 'document') await s.open('b');
    else if (action === 'search') s.beginSearch();
    else s.dispose();
    finish({ file: '/tmp/a.png', type: 'image/png' });
    await pending;
    assert.equal(opened, 0);
    s.dispose();
  });
}
test('changed image resolution and resolver or launcher errors remain recoverable', async () => {
  const r = reader();
  r.read = async (id) => ({ entry: entry(id), source: '![Image](./a.png)' });
  let checks = 0,
    opens = 0;
  r.resolveAsset = async () => ({
    file: ++checks === 1 ? '/tmp/a.png' : '/tmp/b.png',
    type: 'image/png',
  });
  const s = new Session(r, async () => {
    opens++;
    throw new Error('Cannot open image.');
  });
  await s.open('a');
  s.send({ type: 'tab' });
  await s.activate();
  assert.equal(opens, 0);
  assert.match(s.snapshot().notice!, /changed/);
  r.resolveAsset = async () => {
    throw new Error('Permission denied');
  };
  await s.activate();
  assert.equal(opens, 0);
  r.resolveAsset = async () => ({ file: '/tmp/a.png', type: 'image/png' });
  await s.activate();
  assert.equal(opens, 1);
  assert.match(s.snapshot().notice!, /Cannot open image/);
  s.dispose();
});

test('same-document history restores saved positions after selecting a search match', async () => {
  const s = new Session(reader());
  await s.open('a');
  s.send({ type: 'move', delta: 20 });
  await s.follow('#end');
  s.beginSearch();
  s.editSearch('日本語');
  s.commitSearch();
  const searched = s.snapshot().state.top;
  await s.back();
  assert.equal(s.snapshot().state.top, 20);
  assert.equal(s.snapshot().matchIndex, -1);
  s.beginSearch();
  s.commitSearch();
  s.nextMatch(1);
  await s.forward();
  assert.equal(s.snapshot().state.top, searched);
  assert.equal(s.snapshot().query, '日本語');
  s.dispose();
});

test('search resumes in the requested direction and wraps beyond either end', async () => {
  const r = reader();
  r.read = async (id) => ({
    entry: entry(id),
    source:
      'line\n\n'.repeat(15) +
      'needle\n\n' +
      'line\n\n'.repeat(15) +
      'needle\n\n' +
      'line\n\n'.repeat(15),
  });
  const s = new Session(r);
  await s.open('a');
  s.beginSearch();
  s.editSearch('needle');
  s.commitSearch();
  s.send({ type: 'move', delta: -999 });
  s.nextMatch(-1);
  assert.equal(s.snapshot().matchIndex, 1);
  s.send({ type: 'move', delta: 999 });
  s.nextMatch(1);
  assert.equal(s.snapshot().matchIndex, 0);
  const [first, last] = s.snapshot().matches;
  s.send({ type: 'move', delta: last!.row - first!.row - 1 });
  s.nextMatch(-1);
  assert.equal(s.snapshot().matchIndex, 0);
  s.send({ type: 'move', delta: 1 });
  s.nextMatch(1);
  assert.equal(s.snapshot().matchIndex, 1);
  s.dispose();
});

for (const anchor of ['cafe%CC%81', 'caf%C3%A9']) {
  test(`encoded Unicode anchor ${anchor} activates the normalized heading`, async () => {
    const r = reader();
    r.read = async (id) => ({
      entry: entry(id),
      source: `[Go](#${anchor})\n\n` + 'line\n\n'.repeat(30) + '# Cafe\u0301',
    });
    const s = new Session(r);
    await s.open('a');
    s.send({ type: 'tab' });
    await s.activate();
    assert.equal(s.snapshot().notice, null);
    assert.ok(s.snapshot().state.top > 0);
    const heading = s
      .snapshot()
      .layout.targets.find((t) => t.kind === 'heading')!;
    assert.equal(s.snapshot().state.activeTarget, heading.id);
    s.dispose();
  });
}
