import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Library } from '../src/library.js';
import { startWatch } from '../src/tui/watch.js';
import { Session } from '../src/tui/session.js';
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  const end = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > end) assert.fail('Timed out waiting for file changes');
    await pause(30);
  }
}

test('watching refreshes edits, additions, deletion and symlink replacements then closes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-watch-'));
  let watcher: Awaited<ReturnType<typeof startWatch>> | undefined;
  const s = new Session(await Library.create(['.'], dir));
  try {
    await writeFile(
      path.join(dir, 'a.md'),
      '# Start\n\n' + 'line\n\n'.repeat(60),
    );
    const library = await Library.create(['.'], dir);
    watcher = await startWatch(library);
    const session = new Session(library);
    session.configure(54, 20);
    const id = library.snapshot().documents[0]!.id;
    await session.open(id);
    session.send({ type: 'move', delta: 30 });
    let events = 0;
    const unsubscribe = watcher.subscribe(async (error) => {
      events++;
      await session.changed(error);
    });
    await writeFile(
      path.join(dir, 'a.md'),
      '# Changed\n\n' + 'line\n\n'.repeat(60),
    );
    await until(() =>
      session.snapshot().state.document!.source.includes('Changed'),
    );
    assert.equal(session.snapshot().state.top, 30);
    await writeFile(path.join(dir, 'b.md'), '# New');
    await until(() => session.snapshot().entries.length === 2);
    await rm(path.join(dir, 'a.md'));
    await until(() => session.snapshot().entries.length === 1);
    assert.equal(session.snapshot().state.document!.entry.id, id);
    assert.match(session.snapshot().notice!, /Cannot read/);
    await writeFile(path.join(dir, 'secret.txt'), 'SECRET');
    await symlink(path.join(dir, 'secret.txt'), path.join(dir, 'a.md'));
    await pause(700);
    assert.ok(!session.snapshot().state.document!.source.includes('SECRET'));
    await mkdir(path.join(dir, 'node_modules'));
    await writeFile(path.join(dir, 'node_modules', 'hidden.md'), 'hidden');
    await pause(700);
    assert.equal(session.snapshot().entries.length, 1);
    unsubscribe();
    await watcher.close();
    const count = events;
    await writeFile(path.join(dir, 'c.md'), '# After close');
    await pause(700);
    assert.equal(events, count);
    session.dispose();
  } finally {
    s.dispose();
    await watcher?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('disabled watching leaves files unchanged until explicit reread', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-no-watch-'));
  try {
    await writeFile(path.join(dir, 'a.md'), 'Old');
    const library = await Library.create(['.'], dir),
      watcher = await startWatch(library, false),
      s = new Session(library);
    const id = library.snapshot().documents[0]!.id;
    await s.open(id);
    let events = 0;
    watcher.subscribe(() => {
      events++;
    });
    await writeFile(path.join(dir, 'a.md'), 'New');
    await pause(700);
    assert.equal(events, 0);
    assert.equal(s.snapshot().state.document!.source, 'Old');
    await s.open(id);
    assert.equal(s.snapshot().state.document!.source, 'New');
    s.dispose();
    await watcher.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
