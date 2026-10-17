import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Library } from '../src/library.js';
import { App } from '../src/tui/app.js';
const size = { columns: 80, rows: 24 };
const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
test('opens real documents only on Enter and keeps the previous preview on Escape', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-'));
  try {
    await writeFile(
      path.join(dir, 'a.md'),
      '# First document\n' + '日本語 line\n'.repeat(100),
    );
    await writeFile(path.join(dir, 'b.md'), '# Second document');
    const library = await Library.create(['.'], dir);
    const app = render(<App library={library} size={size} />);
    try {
      await settle();
      assert.ok(!app.lastFrame()!.includes('First document'));
      app.stdin.write('\r');
      await settle();
      assert.ok(app.lastFrame()!.includes('First document'));
      assert.ok(app.lastFrame()!.includes('Preview [active]'));
      app.stdin.write('\u001b');
      await settle();
      app.stdin.write('\u001b[B');
      await settle();
      assert.ok(app.lastFrame()!.includes('First document'));
      app.stdin.write('\r');
      await settle();
      assert.ok(app.lastFrame()!.includes('Second document'));
    } finally {
      app.unmount();
      app.cleanup();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('shows empty list, small-size notice and recovery', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-empty-'));
  try {
    const app = render(
      <App library={await Library.create(['.'], dir)} size={size} />,
    );
    try {
      await settle();
      assert.ok(app.lastFrame()!.includes('No Markdown files'));
      app.stdin.write('\r');
      await settle();
      assert.ok(app.lastFrame()!.includes('Files [active]'));
      app.rerender(
        <App
          library={await Library.create(['.'], dir)}
          size={{ columns: 50, rows: 10 }}
        />,
      );
      await settle();
      assert.ok(app.lastFrame()!.includes('Minimum size'));
      app.rerender(
        <App library={await Library.create(['.'], dir)} size={size} />,
      );
      await settle();
      assert.ok(app.lastFrame()!.includes('No Markdown files'));
    } finally {
      app.unmount();
      app.cleanup();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
for (const replacement of ['deleted', 'symlink'] as const) {
  test(`a ${replacement} document is rejected without opening arbitrary files`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-missing-'));
    try {
      await writeFile(path.join(dir, 'a.md'), 'Original');
      await writeFile(path.join(dir, 'secret.txt'), 'Do not display');
      const library = await Library.create(['a.md'], dir);
      await rm(path.join(dir, 'a.md'));
      if (replacement === 'symlink')
        await symlink(path.join(dir, 'secret.txt'), path.join(dir, 'a.md'));
      const app = render(<App library={library} size={size} />);
      try {
        await settle();
        app.stdin.write('\r');
        await settle();
        assert.ok(app.lastFrame()!.includes('Cannot read document'));
        assert.ok(app.lastFrame()!.includes('Files [active]'));
        assert.ok(!app.lastFrame()!.includes('Do not display'));
      } finally {
        app.unmount();
        app.cleanup();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
test('ignores a late read after candidate movement and catches permission errors', async () => {
  let complete!: (value: {
    entry: { id: string; name: string; path: string };
    source: string;
  }) => void;
  const entries = ['a', 'b'].map((id) => ({
    id,
    name: `${id}.md`,
    path: `${id}.md`,
  }));
  const library = {
    snapshot: () => ({ project: 'test', targets: [], documents: entries }),
    read: (id: string) =>
      id === 'a'
        ? new Promise<{ entry: (typeof entries)[number]; source: string }>(
            (resolve) => {
              complete = resolve;
            },
          )
        : Promise.reject(new Error('EACCES')),
  };
  const app = render(<App library={library} size={size} />);
  try {
    await settle();
    app.stdin.write('\r');
    await settle();
    app.stdin.write('\u001b[B');
    await settle();
    complete({ entry: entries[0]!, source: 'Stale text' });
    await settle();
    assert.ok(!app.lastFrame()!.includes('Stale text'));
    app.stdin.write('\r');
    await settle();
    assert.ok(app.lastFrame()!.includes('Cannot read document'));
  } finally {
    app.unmount();
    app.cleanup();
  }
});

test('Tab selects same-line targets, scrolls to headings and preserves selection on resize', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kendai-tui-tab-'));
  try {
    await writeFile(
      path.join(dir, 'a.md'),
      '# Start\n\n[First](./one) [Second](./two)\n\n' +
        'Paragraph 日本語\n\n'.repeat(40) +
        '## End',
    );
    const library = await Library.create(['.'], dir);
    const app = render(<App library={library} size={size} />);
    try {
      await settle();
      app.stdin.write('\t');
      await settle();
      assert.ok(!app.lastFrame()!.includes('Target 1/'));
      app.stdin.write('\r');
      await settle();
      app.stdin.write('\t');
      await settle();
      assert.ok(app.lastFrame()!.includes('Target 1/4 heading: Start'));
      app.stdin.write('\t');
      await settle();
      assert.ok(app.lastFrame()!.includes('Target 2/4 link: First'));
      app.stdin.write('\t');
      await settle();
      assert.ok(app.lastFrame()!.includes('Target 3/4 link: Second'));
      app.stdin.write('\t');
      await settle();
      assert.ok(app.lastFrame()!.includes('Target 4/4 heading: End'));
      app.rerender(<App library={library} size={{ columns: 120, rows: 40 }} />);
      await settle();
      assert.ok(app.lastFrame()!.includes('Target 4/4 heading: End'));
      assert.ok(app.lastFrame()!.includes('## End'));
      app.stdin.write('\u001b[A');
      await settle();
      assert.ok(!app.lastFrame()!.includes('Target 4/4'));
    } finally {
      app.unmount();
      app.cleanup();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('arrows scroll only tables and Tab reveals hidden links across resize', async () => {
  const entry = { id: 'a', name: 'table.md', path: 'table.md' };
  const source =
    'Plain paragraph\n\n| First | Second | Third | Fourth | Fifth | Sixth | Seventh | Eighth |\n|---|---|---|---|---|---|---|---|\n| alpha | bravo | charlie | delta | echo | foxtrot | golf | [終端](./last) |';
  const library = {
    snapshot: () => ({ project: 'test', targets: [], documents: [entry] }),
    read: async () => ({ entry, source }),
  };
  const app = render(<App library={library} size={size} />);
  try {
    await settle();
    app.stdin.write('\u001b[C');
    await settle();
    app.stdin.write('\r');
    await settle();
    assert.ok(app.lastFrame()!.includes('Table X 0/'));
    app.stdin.write('\u001b[C');
    await settle();
    assert.ok(app.lastFrame()!.includes('Table X 4/'));
    assert.ok(app.lastFrame()!.includes('Plain paragraph'));
    app.stdin.write('\t');
    await settle();
    assert.ok(app.lastFrame()!.includes('終端'));
    assert.ok(app.lastFrame()!.includes('link: 終端'));
    app.rerender(<App library={library} size={{ columns: 120, rows: 24 }} />);
    await settle();
    assert.ok(app.lastFrame()!.includes('終端'));
    assert.ok(app.lastFrame()!.includes('link: 終端'));
    app.rerender(<App library={library} size={size} />);
    await settle();
    app.stdin.write('\u001b');
    await settle();
    const before = app.lastFrame();
    const horizontal = before!.match(/Table X (\d+)\//)?.[1];
    app.stdin.write('\u001b[D');
    await settle();
    assert.equal(app.lastFrame(), before);
    app.stdin.write('\r');
    await settle();
    assert.ok(app.lastFrame()!.includes(`Table X ${horizontal}/`));
  } finally {
    app.unmount();
    app.cleanup();
  }
});

test('search keys, outline and back-forward history operate without opening external apps', async () => {
  const entries = ['a', 'b'].map((id) => ({
    id,
    name: `${id}.md`,
    path: `${id}.md`,
  }));
  const library = {
    snapshot: () => ({ project: 'test', targets: [], documents: entries }),
    read: async (id: string) => ({
      entry: entries.find((e) => e.id === id)!,
      source:
        id === 'a'
          ? '# Start\n\n日本語\n\n日本語\n\n[Next](b.md#section)\n\n' +
            'line\n\n'.repeat(30) +
            '## End'
          : '# Other\n\n## Section',
    }),
    resolveDocument: async () => 'b',
  };
  const app = render(<App library={library} size={size} />);
  try {
    await settle();
    app.stdin.write('\r');
    await settle();
    app.stdin.write('/');
    await settle();
    app.stdin.write('日本語');
    await settle();
    app.stdin.write('\r');
    await settle();
    assert.ok(app.lastFrame()!.includes('Find 1/2 [g/G]'));
    app.stdin.write('g');
    await settle();
    assert.ok(app.lastFrame()!.includes('Find 2/2'));
    app.stdin.write('G');
    await settle();
    assert.ok(app.lastFrame()!.includes('Find 1/2'));
    app.stdin.write('/');
    await settle();
    app.stdin.write('q');
    await settle();
    assert.ok(app.lastFrame()!.includes('Search: /日本語q'));
    app.stdin.write('\u001b');
    await settle();
    assert.ok(app.lastFrame()!.includes('Preview [active]'));
    app.stdin.write('o');
    await settle();
    assert.ok(app.lastFrame()!.includes('Headings —'));
    app.stdin.write('\u001b[B');
    await settle();
    app.stdin.write('\r');
    await settle();
    assert.ok(app.lastFrame()!.includes('## End'));
    app.stdin.write('o');
    await settle();
    app.stdin.write('\u001b[A');
    await settle();
    app.stdin.write('\r');
    await settle();
    app.stdin.write('\t');
    await settle();
    app.stdin.write('\r');
    await settle();
    assert.ok(app.lastFrame()!.includes('Other'));
    app.stdin.write('<');
    await settle();
    assert.ok(app.lastFrame()!.includes('Preview [active] a.md'));
    app.stdin.write('>');
    await settle();
    assert.ok(app.lastFrame()!.includes('Other'));
  } finally {
    app.unmount();
    app.cleanup();
  }
});

test('Shift+Tab selects previous links and headings without leaving the current document', async () => {
  const entry = { id: 'a', name: 'a.md', path: 'a.md' };
  const library = {
    snapshot: () => ({ project: 'test', targets: [], documents: [entry] }),
    read: async () => ({
      entry,
      source: '# Start\n\n[First](./one) [Second](./two)',
    }),
  };
  const app = render(<App library={library} size={size} />);
  try {
    await settle();
    app.stdin.write('\u001b[Z');
    await settle();
    assert.ok(app.lastFrame()!.includes('Files [active]'));
    app.stdin.write('\r');
    await settle();
    for (let i = 0; i < 3; i++) {
      app.stdin.write('\t');
      await settle();
    }
    assert.ok(app.lastFrame()!.includes('Target 3/3 link: Second'));
    app.stdin.write('\u001b[Z');
    await settle();
    assert.ok(app.lastFrame()!.includes('Target 2/3 link: First'));
    app.stdin.write('\u001b[Z');
    await settle();
    assert.ok(app.lastFrame()!.includes('Target 1/3 heading: Start'));
    app.stdin.write('\u001b[Z');
    await settle();
    assert.ok(app.lastFrame()!.includes('Target 1/3 heading: Start'));
  } finally {
    app.unmount();
    app.cleanup();
  }
});

test('images can be selected in both directions and Enter alone requests a viewer', async () => {
  const entry = { id: 'a', name: 'a.md', path: 'a.md' },
    opened: string[] = [];
  const library = {
    snapshot: () => ({ project: 'test', targets: [], documents: [entry] }),
    read: async () => ({
      entry,
      source: '# Start\n\n![図](./a.png)\n\n[Guide](./guide.md)',
    }),
    resolveAsset: async () => ({ file: '/tmp/a.png', type: 'image/png' }),
  };
  const imageOpener = async (file: string) => {
    opened.push(file);
  };
  const app = render(
    <App library={library} imageOpener={imageOpener} size={size} />,
  );
  try {
    await settle();
    app.stdin.write('\r');
    await settle();
    assert.equal(opened.length, 0);
    app.stdin.write('\t');
    await settle();
    app.stdin.write('\t');
    await settle();
    assert.ok(app.lastFrame()!.includes('image: 図'));
    assert.ok(app.lastFrame()!.includes('[Image: 図] ./a.png'));
    assert.equal(opened.length, 0);
    app.stdin.write('\t');
    await settle();
    app.stdin.write('\u001b[Z');
    await settle();
    assert.ok(app.lastFrame()!.includes('image: 図'));
    app.stdin.write('\r');
    await settle();
    assert.deepEqual(opened, ['/tmp/a.png']);
    assert.ok(app.lastFrame()!.includes('Requested image viewer: 図'));
    assert.ok(app.lastFrame()!.includes('Preview [active] a.md'));
  } finally {
    app.unmount();
    app.cleanup();
  }
});

test('q remains search input at full size but quits after resizing below minimum', async () => {
  let exited = false;
  function ExitProbe() {
    React.useEffect(
      () => () => {
        exited = true;
      },
      [],
    );
    return null;
  }
  const entry = { id: 'a', name: 'a.md', path: 'a.md' };
  const library = {
    snapshot: () => ({ project: 'test', targets: [], documents: [entry] }),
    read: async () => ({ entry, source: '# Document' }),
  };
  const view = (dimensions: typeof size) => (
    <>
      <App library={library} size={dimensions} />
      <ExitProbe />
    </>
  );
  const app = render(view(size));
  try {
    await settle();
    app.stdin.write('\r');
    await settle();
    app.stdin.write('/');
    await settle();
    app.stdin.write('q');
    await settle();
    assert.ok(app.lastFrame()!.includes('Search: /q'));
    assert.equal(exited, false);
    app.rerender(view({ columns: 50, rows: 10 }));
    await settle();
    assert.ok(app.lastFrame()!.includes('Press q to quit'));
    app.stdin.write('q');
    await settle();
    assert.equal(exited, true);
  } finally {
    app.unmount();
    app.cleanup();
  }
});
