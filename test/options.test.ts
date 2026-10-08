import assert from 'node:assert/strict';
import { test } from 'node:test';
import { help, parseOptions } from '../src/options.js';

test('repeated short and long targets preserve caller order', () => {
  assert.deepEqual(
    parseOptions(['-t', 'doc/', '--target', 'README.md', '-t', 'my notes.md']),
    {
      targets: ['doc/', 'README.md', 'my notes.md'],
      port: 0,
      open: true,
      watch: true,
      help: false,
      version: false,
    },
  );
});

test('no-watch disables watching independently of browser and port options', () => {
  assert.equal(parseOptions([]).watch, true);
  const options = parseOptions(['--no-watch', '--no-open', '-p', '4321']);
  assert.equal(options.watch, false);
  assert.equal(options.open, false);
  assert.equal(options.port, 4321);
  assert.match(help, /--no-watch/);
});

test('explicit port and no-open override the defaults', () => {
  const options = parseOptions(['-t', '.', '-p', '4321', '--no-open']);
  assert.equal(options.port, 4321);
  assert.equal(options.open, false);
});

test('omitted targets default to the current directory', () => {
  assert.deepEqual(parseOptions([]).targets, ['.']);
  assert.deepEqual(parseOptions(['--no-open', '-p', '4321']).targets, ['.']);
});

test('help and version do not require targets', () => {
  assert.equal(parseOptions(['--help']).help, true);
  assert.equal(parseOptions(['-v']).version, true);
});

for (const args of [
  ['-t', ''],
  ['-t', '   '],
  ['-t'],
  ['README.md'],
  ['-t', '.', '--build'],
  ['-t', '.', '--export'],
]) {
  test(`invalid arguments fail: ${JSON.stringify(args)}`, () =>
    assert.throws(() => parseOptions(args)));
}

for (const port of ['0', '65536', '-1', '1.5', 'NaN', '1e3', '', ' 80']) {
  test(`invalid port fails: ${JSON.stringify(port)}`, () => {
    assert.throws(
      () => parseOptions(['-t', '.', `--port=${port}`]),
      /Port must/,
    );
  });
}

test('port boundaries are accepted', () => {
  assert.equal(parseOptions(['-t', '.', '-p', '1']).port, 1);
  assert.equal(parseOptions(['-t', '.', '-p', '65535']).port, 65535);
});

test('help identifies the project and its CLI command', () => {
  assert.match(help, /^kendai-md —/);
  assert.match(help, /\n  kendai \[-t <path>/);
  assert.match(help, /\n  npx kendai-md\n/);
});
