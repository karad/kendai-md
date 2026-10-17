# Small pieces, one workspace

kendai-md is a Node.js CLI with a local browser reader and an optional terminal reader, written in TypeScript. The browser UI uses no application framework; the terminal UI uses Ink and React. Document rendering stays local.

## The reading flow

1. The CLI validates repeatable targets and optional server settings.
2. The library scans selected paths and assigns stable document IDs.
3. The HTTP server exposes the library and sanitized document content.
4. The browser displays the file list, document, and outline.
5. A file watcher sends change events so the reader stays current.

## Terminal reading flow

The --tui option validates terminal availability and reads selected document IDs directly. Ink and React render a file list and styled Markdown preview. A session store owns search, heading selection, back/forward history, document positions and asynchronous read generations. A terminal-specific parser produces styled spans and heading/link coordinates; anchors use the browser's slug rules. Relative links pass through the library's selected-document resolver and read checks. A separate local watcher refreshes the library and current preview, serializes notifications and drains on shutdown. `--no-watch` disables it. No HTTP server or browser starts in this mode. The browser renderer is separate.

## Project structure

Image targets retain their descriptions and source references in the terminal layout. Enter resolves a relative image through the library's existing asset boundary, rechecks the result and requests the OS default application through an injected launcher. Selection and document generations prevent stale resolutions from opening an image. Launch arguments are separated from command code, and launcher output is detached from terminal rendering. Automated tests use a fake launcher.

Terminal tables are laid out as styled cells with shared column widths and physical display-cell coordinates. Only table lines are clipped horizontally; ordinary text retains its normal wrapping. Tab navigation uses the table target's row and column to reveal its first character after scrolling or resizing.

```text
src/
  cli.ts              Process lifecycle and browser opening
  options.ts          CLI argument validation
  library.ts          Target discovery and file access boundaries
  render.ts           Markdown, headings, highlighting, sanitization
  server.ts           Local HTTP API and file change events
  types.ts            Shared data contracts
  tui/                Terminal state, safe text, UI and process lifecycle
  web/
    client.ts         Browser interaction and rendering
    view-model.ts     Search, grouping, and selection rules
    index.html        Reader shell
    styles.css        Responsive light and dark themes
test/                 Unit and integration tests
scripts/compile.mjs   Prepare the distributable package
```

## File access

Document IDs refer only to the current library. Requests cannot select an arbitrary Markdown path. Images use a separate endpoint that checks their file type and canonical path against allowed roots.

Scans skip symlinks inside directories. File reads check the canonical path again because files can change after discovery.

The HTTP server listens on loopback and checks its host and request origin. Browser assets are bundled in the package and served from a fixed allowlist.

## Change events

Chokidar watches the selected targets. A short debounce groups filesystem activity, and Server-Sent Events notify connected browsers after the library refreshes. The browser then requests a fresh snapshot and the selected document.

## Package boundaries

Terminal lifecycle tests run the production `runTui` with temporary real documents; the render-error fixture lives only under `test/fixtures`. The production benchmark generates its workload under a temporary directory and reports discovery, layout, search and viewport logic separately from terminal painting. The retired prototype is not a source or verification dependency. See [Terminal reader validation](tui-validation.md).

The package's `bin` entry points to `dist/cli.js`. Browser assets are resolved from the installed package, while target paths are resolved from the caller's working directory. This separation lets the same CLI serve documentation from another project.

`npm pack` compiles the package and prepares a tarball. Run `npm run check` and `npm run test:package` to validate it before distribution. Publishing is a separate action; `prepublishOnly` runs both checks before publishing.
