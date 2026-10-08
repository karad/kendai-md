# Small pieces, one workspace

kendai-md is a Node.js CLI, a local HTTP server, and a browser reader written in TypeScript. It uses no application framework or hosted backend.

## The reading flow

1. The CLI validates repeatable targets and optional server settings.
2. The library scans selected paths and assigns stable document IDs.
3. The HTTP server exposes the library and sanitized document content.
4. The browser displays the file list, document, and outline.
5. A file watcher sends change events so the reader stays current.

## Project structure

```text
src/
  cli.ts              Process lifecycle and browser opening
  options.ts          CLI argument validation
  library.ts          Target discovery and file access boundaries
  render.ts           Markdown, headings, highlighting, sanitization
  server.ts           Local HTTP API and file change events
  types.ts            Shared data contracts
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

The package's `bin` entry points to `dist/cli.js`. Browser assets are resolved from the installed package, while target paths are resolved from the caller's working directory. This separation lets the same CLI serve documentation from another project.

`npm pack` compiles the package and prepares a tarball. Run `npm run check` and `npm run test:package` to validate it before distribution. Publishing is a separate action; `prepublishOnly` runs both checks before publishing.
