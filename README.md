# kendai-md — A quick look at your Markdown.

kendai-md is a simple, local Markdown viewer. Point it at files or directories to open your project's documentation in the browser, check what you need, and get back to work.

## Getting started

Requires **Node.js 22 or later**. After the package is published on npm, install it globally:

```bash
npm install -g kendai-md
kendai
```

Your browser opens automatically, and the terminal prints the local URL. The viewer updates as you save your files. Press **Ctrl+C** in the terminal to stop the server.

Or run it without a global installation:

```bash
npx kendai-md
```

You can also run the repository directly from GitHub (Git is required):

```bash
npx github:karad/kendai-md
# Equivalent GitHub shorthand
npx karad/kendai-md
```

GitHub installation compiles the TypeScript sources using npm's `prepare` lifecycle. Allow this build if your npm version asks for script permission. The npm release includes compiled files and does not need a compiler at installation time.

Repeat `-t` to bring multiple files and directories into the same workspace.

## Features

- **Bring documents together.** Combine directories and individual files in one workspace.
- **Read rendered Markdown.** Syntax highlighting, tables, task lists, and a table of contents make documents easy to scan.
- **Follow document links.** Navigate relative Markdown links and jump to headings.
- **See changes as you save.** The viewer updates when files are edited, added, or deleted.
- **Find files quickly.** Press `/` or `⌘K` / `Ctrl+K` to search by filename or path.
- **Choose your theme.** Switch between light and dark themes.

Directories are scanned recursively for `.md` and `.markdown` files. When `-t` is omitted, the current directory is the target. Hidden files and directories (including `.git`, `.cache`, and `.venv`), dependency directories (`node_modules`, `bower_components`, `vendor`, `venv`), and generated directories (`dist`, `build`, `coverage`, `__pycache__`) are excluded from discovery and watching. These exclusions apply at every depth. An excluded directory or file can still be selected explicitly with `-t`. Repeated targets and overlapping directories do not create duplicate entries. Symlinks found during directory scans are skipped; symlinks explicitly passed with `-t` are resolved when the CLI starts.

## CLI usage

Paths are resolved from the directory where you run the command. Your documents stay where they are, and the original files are never modified.

```bash
# Open Markdown throughout the current directory
kendai

# Open several parts of a project
kendai -t doc/ -t README.md -t AGENTS.md

# Choose a port and open the browser yourself
kendai -t doc/ --port 4321 --no-open

# Read without automatic updates
kendai --no-watch

# See every option
kendai --help
```

| Option                | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `-t, --target <path>` | Add a Markdown file or directory. Repeatable; defaults to `.`. |
| `-p, --port <number>` | Choose a port. Defaults to an available port.                  |
| `--no-open`           | Start the server without opening the browser.                  |
| `--no-watch`          | Disable file watching and automatic updates.                   |
| `-h, --help`          | Show CLI help.                                                 |
| `-v, --version`       | Show the package version.                                      |

## Local by design

Use `--no-watch` to disable file watching and polling. The file list is captured at startup; restart kendai to discover added, deleted, or renamed files. Browser reloads can show edits to existing documents, but do not rescan the targets.

kendai-md binds to `127.0.0.1`. Markdown rendering and HTML sanitization happen locally, with no CDN, analytics, external AI, or hosted rendering service. Remote images are replaced with alt text, so opening a document does not contact an image host. External links open only when you click them.

Relative images are served from selected directories or the parent directory of an explicitly selected file. Only supported image formats are served, and each resolved path is checked to ensure it stays within those boundaries. Relative document links work when the destination is among the selected targets. Links to unselected files show instructions for adding them.

There are no HTML or PDF export features or build options for generating a static site.

## Documentation

See the [usage guide](doc/getting-started.md) for a walkthrough, the [Markdown reference](doc/markdown-reference.md) for supported syntax, and the [architecture overview](doc/architecture.md) for implementation details.

## Development and packaging

Clone the repository (or your fork), then install the development dependencies:

```bash
git clone https://github.com/karad/kendai-md.git
cd kendai-md
npm ci
npm run kendai -- -t doc/ -t README.md
npm run check
npm run test:package
npm pack
```

`npm run check` checks formatting and TypeScript types, runs unit and integration tests, and compiles the package.

`npm run test:package` verifies a global installation in a temporary prefix, execution through `npm exec` (the command behind `npx`), and compilation from a clean local Git repository. It also checks default and explicit targets, bundled browser assets, rendering, and server shutdown from another directory. Git is required. Offline installation uses packages cached by `npm ci`; your normal global installation is not changed.

The internal `compile` script prepares the CLI and browser assets; it does not export documents. `npm run kendai` compiles automatically before starting.

The package includes the `kendai` command and browser assets. Before publishing, you can try the generated tarball (`.tgz` file) in another project:

```bash
cd /path/to/another-project
npm exec --yes --package=/absolute/path/to/kendai-md-0.1.0.tgz -- kendai -t doc/ -t README.md
```

## Contributing

Bug reports, documentation improvements, and focused pull requests are welcome. For a larger change, open an issue first to discuss the use case and scope.

1. Fork this repository and clone your fork.
2. Follow the development setup above using Node.js 22 or later and Git.
3. Keep UI text, code comments, and identifiers in English.
4. Add tests for changed behavior, especially file access boundaries, document rendering, and UI state decisions.
5. Run `npm run check` and `npm run test:package` before opening a pull request. Include what changed and how you verified it.

Keep document rendering local. HTML/PDF export and static-site generation are outside this project's scope.

## Bugs and feature requests

Use [GitHub Issues](https://github.com/karad/kendai-md/issues) to report reproducible bugs or propose improvements. Before opening an issue, check for an existing report.

For bugs, include your operating system, Node.js version, kendai-md version, the command you ran, expected and actual behavior, and a minimal Markdown example. Remove private document contents and sensitive paths from examples and logs.

## Maintainer releases

For manual installation testing, run `npm run install:local`. This removes the existing global `kendai-md` installation, runs `npm pack`, and installs the generated tarball globally using the active npm prefix. Stop any running kendai server first. If a step fails, later steps do not run; the previous installation may already have been removed. After testing, run `npm uninstall -g kendai-md`.

See the [npm publishing guide](doc/publishing.md) for release checks, authentication, publishing, and post-release verification.

## License

[MIT](LICENSE)
