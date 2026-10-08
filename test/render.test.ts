import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMarkdown } from '../src/render.js';

test('headings provide readable text, Japanese anchors, and unique repeated IDs', () => {
  const result = renderMarkdown(
    '# Hello **world**\n\n## 日本語の見出し\n\n## Code `example`\n\n## Code `example`',
  );
  assert.equal(result.title, 'Hello world');
  assert.deepEqual(result.headings, [
    { id: 'hello-world', text: 'Hello world', level: 1 },
    { id: '日本語の見出し', text: '日本語の見出し', level: 2 },
    { id: 'code-example', text: 'Code example', level: 2 },
    { id: 'code-example-1', text: 'Code example', level: 2 },
  ]);
  assert.match(result.html, /id="code-example-1"/);
});

test('tables, strikethrough, disabled task lists, and details survive rendering', () => {
  const { html } = renderMarkdown(
    '| A | B |\n|---|---|\n| 1 | 2 |\n\n~~Old~~\n\n- [x] Done\n- [ ] Next\n\n<details><summary>More</summary>Details</details>',
  );
  assert.match(html, /<table>/);
  assert.match(html, /<s>Old<\/s>/);
  assert.match(html, /type="checkbox" disabled checked/);
  assert.match(html, /type="checkbox" disabled \/>/);
  assert.match(html, /<details><summary>More<\/summary>Details<\/details>/);
});

test('known code languages are highlighted and unknown languages remain escaped', () => {
  const highlighted = renderMarkdown(
    '```typescript\nconst x = "value";\n```',
  ).html;
  assert.match(highlighted, /hljs-keyword/);
  const plain = renderMarkdown(
    '```not-a-language\n<script>alert(1)</script>\n```',
  ).html;
  assert.match(plain, /&lt;script&gt;/);
  assert.doesNotMatch(plain, /<script>/);
});

test('active HTML, event handlers, unsafe schemes, styles, and forms are removed', () => {
  const { html } = renderMarkdown(
    '<script>alert(1)</script>\n\n<img src="photo.png" onerror="alert(1)"><a href="javascript:alert(1)">Bad</a><iframe src="https://example.com"></iframe><form><input type="text" value="secret"></form><div style="position:fixed">Safe</div>',
  );
  assert.doesNotMatch(
    html,
    /<script|onerror|javascript:|iframe|<form|type="text"|style=/,
  );
  assert.match(html, /Safe/);
  assert.match(html, /src="photo.png"/);
});

test('documents rewrite local images before reaching the browser and drop remote image sources', () => {
  const { html } = renderMarkdown(
    '![Local](assets/my%20image.png)\n\n![Remote](https://example.com/pic.png)\n\n<img src="//example.com/a.png">',
    'abc',
  );
  assert.match(html, /src="\/asset\?id=abc&amp;path=assets%2Fmy\+image.png/);
  assert.match(html, /alt="Remote"/);
  assert.doesNotMatch(html, /example\.com/);
});

test('malformed image URL encoding is harmless', () => {
  assert.doesNotThrow(() =>
    renderMarkdown('<img src="%E0%A4.png" alt="Broken">', 'abc'),
  );
  assert.doesNotMatch(
    renderMarkdown('<img src="%E0%A4.png">', 'abc').html,
    /src=/,
  );
});

test('BOM, empty documents, and word counts have stable behavior', () => {
  assert.equal(renderMarkdown('\uFEFF# Title').title, 'Title');
  assert.deepEqual(renderMarkdown(''), {
    html: '',
    headings: [],
    title: '',
    words: 0,
  });
  assert.equal(renderMarkdown('one two three').words, 3);
  assert.ok(renderMarkdown('日本語の文書を読みます。').words > 1);
});

test('heading IDs reset independently for each rendered document', () => {
  assert.equal(renderMarkdown('# Title').headings[0]!.id, 'title');
  assert.equal(renderMarkdown('# Title').headings[0]!.id, 'title');
});

test('document HTML cannot reuse application layout classes', () => {
  const { html } = renderMarkdown(
    '<span class="sidebar">Text</span><code class="toolbar">Code</code>',
  );
  assert.doesNotMatch(html, /class="(?:sidebar|toolbar)"/);
  assert.match(html, /Text/);
});
