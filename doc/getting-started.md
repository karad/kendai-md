# Start with what you have

Your documentation already lives with your project. kendai-md brings it together without asking you to reorganize it.

## Pick your targets

Run `kendai` without `-t` to discover Markdown throughout the current directory. Hidden entries, `node_modules`, `bower_components`, `vendor`, `dist`, `build`, `coverage`, `venv`, and `__pycache__` are excluded from recursive discovery and watching.

To limit the selection, select each file or directory with `-t`. Directory targets include Markdown files in nested folders.

```bash
kendai -t doc/ -t README.md -t AGENTS.md
```

Targets are resolved from your current working directory. Spaces in a path work when the path is quoted:

```bash
kendai -t "project notes/" -t "Release notes.md"
```

## Find a document

The sidebar groups files by their directory. Type a filename or part of its path in **Find a document** to narrow the list. Search matches filenames and paths, not document contents.

Press `/`, `⌘K`, or `Ctrl+K` to focus search. Press `Escape` to clear the search and close the navigation drawer on small screens.

## Follow the thread

Relative Markdown links connect documents in the selected targets. Try the [Markdown reference](markdown-reference.md#code-blocks) or return to the [workspace overview](../README.md).

Headings appear in **On this page** on wide screens. Click an entry to jump to that section. The URL keeps the document and heading, so you can copy a link while the server is running. Use a fixed `--port` to keep the local address stable across sessions.

## Keep writing

Edit your Markdown in your usual editor. Saving a file refreshes the rendered document while keeping your scroll position. New and deleted files update the sidebar too.

An empty directory is a valid target. Add your first `.md` file and it will appear automatically.

## Read your way

Use the theme button in the upper-right corner to switch between light and dark. Your preference is saved in your browser for the current local address.

On smaller screens, the menu button opens your document list. The reading area stays focused on the page.

## Stop the server

Press **Ctrl+C** in the terminal that started kendai. The watcher and local server close together.

## Read without watching

Use `kendai --no-watch` to disable file watching and polling. The file list is captured at startup. Restart kendai to discover added, deleted, or renamed files; reloading the browser does not rescan the targets. Existing documents are read when requested, so reloading the browser can show edits to a selected file. Changes are not pushed to the browser automatically.
