import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { imagePath, openLocalImage } from '../src/tui/images.js';

test('image references decode local paths and reject remote, absolute, empty and malformed values', () => {
  assert.equal(imagePath('./日本語%20one.png?v=2#part'), './日本語 one.png');
  for (const input of [
    '',
    '#part',
    'https://example.com/a.png',
    '//host/a.png',
    'file:///a.png',
    'data:image/png;base64,a',
    '/a.png',
    '%2fa.png',
    '%ZZ',
    'a.png#%ZZ',
    'a%00b.png',
  ])
    assert.throws(() => imagePath(input), input);
});
for (const platform of ['darwin', 'linux', 'win32'] as const) {
  test(`image launcher keeps filenames out of command code on ${platform}`, async () => {
    const file = '/tmp/日本語 $() `name` one.png';
    const child = Object.assign(new EventEmitter(), { unref() {} });
    let command = '',
      args: string[] = [],
      settings: SpawnOptions | undefined;
    const failures: string[] = [];
    await openLocalImage(
      file,
      (message) => {
        failures.push(message);
      },
      {
        platform,
        launch: (cmd, argv, options) => {
          command = cmd;
          args = argv;
          settings = options;
          queueMicrotask(() => child.emit('spawn'));
          return child as ChildProcess;
        },
      },
    );
    assert.equal(settings!.stdio, 'ignore');
    assert.equal(settings!.shell, false);
    if (platform === 'win32') {
      assert.equal(command, 'powershell.exe');
      assert.equal(settings!.env!.KENDAI_IMAGE_PATH, file);
      assert.ok(!args.join(' ').includes(file));
      assert.ok(args.join(' ').includes('$env:KENDAI_IMAGE_PATH'));
    } else {
      assert.equal(command, platform === 'darwin' ? 'open' : 'xdg-open');
      assert.deepEqual(args, [file]);
    }
    child.emit('exit', 1, null);
    assert.equal(failures.length, 1);
    child.emit('error', new Error('late'));
    assert.equal(failures.length, 1);
  });
}
test('launcher spawn errors reject and unsupported platforms do not launch', async () => {
  const child = Object.assign(new EventEmitter(), { unref() {} });
  await assert.rejects(
    openLocalImage('/tmp/a.png', () => {}, {
      launch: () => {
        queueMicrotask(() => child.emit('error', new Error('ENOENT')));
        return child as ChildProcess;
      },
    }),
  );
  await assert.rejects(openLocalImage('relative.png', () => {}));
  await assert.rejects(
    openLocalImage('/tmp/a.png', () => {}, { platform: 'aix' }),
  );
});
