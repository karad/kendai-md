import test from 'node:test';
import assert from 'node:assert/strict';
import stringWidth from 'string-width';
import { safeText, plainLines } from '../src/tui/text.js';
test('removes terminal commands, BOM and unsafe controls but retains text', () => {
  assert.equal(
    safeText('\uFEFF\u001b[31m日本語\u001b[0m\u001b]0;bad\u0007\u0000\tend'),
    '日本語    end',
  );
});
test('normalizes newlines and wraps wide text without losing content', () => {
  assert.deepEqual(plainLines('a\r\nb\rc', 5), ['a', 'b', 'c']);
  const source = '日本語 e\u0301 😀 ' + 'long'.repeat(30);
  const result = plainLines(source, 12);
  assert.ok(result.every((line) => stringWidth(line) <= 12));
  assert.equal(
    result.join('').replace(/\s/g, ''),
    source.normalize('NFC').replace(/\s/g, ''),
  );
  assert.deepEqual(plainLines('', 10), ['']);
});
