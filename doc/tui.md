# Terminal reader

The terminal reader is part of the main kendai CLI. It shares the browser reader's file discovery and access boundaries. Source-checkout validation commands, performance measurements and environment coverage are described in [Terminal reader validation](tui-validation.md).

Use Node.js v24.22.0 or later. For development, run `nvm use` from the repository root.

```sh
kendai --tui
kendai -T
kendai --tui -t README.md -t doc/
```

From a source checkout:

```sh
npm run kendai -- --tui -t README.md -t doc/
```

`-T` is the short form of `--tui`; lowercase `-t` still selects a target path.

Targets are resolved from the caller's working directory. Multiple targets, recursive discovery, exclusions and duplicate removal follow the browser reader's rules.
Both stdin and stdout must be interactive terminals. The initial target must exist and be a Markdown file or directory.

## Controls

| Mode    | Key                          | Action                                               |
| ------- | ---------------------------- | ---------------------------------------------------- |
| Files   | Up / Down                    | Move the candidate cursor by one file                |
| Files   | PageUp / PageDown            | Move the cursor by a viewport                        |
| Files   | Enter                        | Read the selected document and focus the preview     |
| Preview | Up / Down                    | Scroll by one displayed line                         |
| Preview | PageUp / PageDown            | Scroll by a viewport                                 |
| Preview | Left / Right                 | Scroll tables horizontally by four display cells     |
| Preview | Tab                          | Select the next link, heading or image               |
| Preview | Shift+Tab                    | Select the previous link, heading or image           |
| Preview | Enter                        | Open the selected link, heading or local image       |
| Preview | /                            | Enter a literal document search                      |
| Preview | g / G                        | Next / previous search match, wrapping at the ends   |
| Preview | o                            | Open the heading list                                |
| Preview | < / >                        | Back / forward through navigation history            |
| Search  | Enter / Escape               | Find / cancel editing; Backspace deletes a character |
| Outline | Up / Down, PageUp / PageDown | Select a heading                                     |
| Outline | Enter / Escape               | Jump / close without moving                          |
| Preview | Escape                       | Return to files, preserving the preview and position |
| Either  | q / Ctrl+C                   | Exit and restore the terminal                        |

The preview starts empty. Moving the file cursor does not open a document. Enter reads the selection again and restores that document's saved position; the first open starts at the top. Positions and history last only for the current process.
Deleted or unavailable documents show an error and leave the file list usable. Empty directories are valid and show an empty-list message.

## Limits

- Headings, emphasis, links, lists, quotes and code are rendered using terminal styles. Links are underlined and their destinations are shown.
- Tab selects the next link, heading or image and Shift+Tab selects the previous one, including multiple targets on one line. Both scroll the selection into view vertically and horizontally. Tab stops at the last target; Shift+Tab stops at the first. Enter opens the selection.
- Relative Markdown links, directory README links and heading fragments can be opened when their document is among the selected targets. External URLs, absolute paths, malformed encodings and unselected documents show a message without opening another app. Missing fragments show the document's top with a message. Duplicate heading fragments follow the browser reader's naming rules.
- `<` returns to the previous document or anchor position; `>` goes forward again. Failed reads leave the current document and history intact. Opening a new destination after going back clears forward history. Escape returns to the file list and does not consume history.
- Without a selection, Tab starts at the first target on or after the top visible line; Shift+Tab starts at the last target on or before that line. If there is no such target, nothing changes. Scrolling clears the selection; resizing preserves the selected target. These keys select within the current document without changing navigation history.
- Tables have borders, aligned columns and wrapped cells. Markdown left, center and right alignment is respected. Column content widths are capped at 24 display cells; longer columns shrink toward six cells to fit, while short columns keep their natural width (at least two cells). Tables that remain wider than the preview can be scrolled with Left / Right.
- Horizontal position is shared by tables in the document, with each table stopping at its own right edge. Ordinary paragraphs and code do not move horizontally. The footer shows `Table X current/maximum` when horizontal scrolling is available. Escape and reopening preserve the position. Tab and resizing bring the selected target's first character into view.
- Search is case-insensitive literal matching in displayed text, including code and tables. Matches are highlighted and the footer shows the current match and count. Ordinary wrapped text can match across display lines. Table borders and padding are part of the displayed text, so a phrase split across table cell lines may require searching a shorter part. An empty search clears highlights; Escape cancels edits and retains the previous search. While typing, `q`, `g`, `G`, `<` and `>` are search characters; Ctrl+C exits. Regular expressions, replacement and cross-document search are not included.
- `o` lists headings in document order. Enter jumps to the candidate and Escape closes the list without moving. Resizing keeps a selected heading or search match visible.
- Images show `[Image: description] path` and are selectable, including images in headings and tables. Missing descriptions use `Image`. References follow Markdown URL normalization and are decoded when resolving local files. A linked image has a separate `[Link]` target for its outer link and an image target for opening the image itself.
- Enter on an image requests the OS default application for that local file. PNG, JPG/JPEG, GIF, WebP, SVG, AVIF and ICO follow the browser reader's image access rules. Images must be relative to the document and inside a selected directory or the parent of an explicitly selected Markdown file. Hidden/excluded paths, outside symlinks, unsupported files and missing images cannot be opened. Query strings and fragments are not passed to the viewer.
- Remote URLs, data/file schemes, absolute paths and malformed references show an error without downloading or launching anything. Images are opened only on Enter, never by displaying, selecting, searching or watching a document. Opening an image does not change document position or back/forward history.
- A `Requested image viewer` message confirms that the OS launcher accepted the request; it does not verify that the viewer displayed the image. Launcher errors appear in the footer and leave the terminal usable. macOS uses `open`, Linux/WSL uses `xdg-open`, and Windows uses the default file association via PowerShell. A desktop environment and image association must be available. SVG and other formats may open in a browser if that is the OS default.
- No HTTP server or external service is started by the terminal reader. An image application is launched only for a selected, allowed local image. Raw HTML is displayed as text. Merged table cells, HTML tables and inline terminal image rendering are not included.
- `--port` and `--no-open` cannot be combined with `--tui`.
- Selected targets are watched by default. Saving a document updates its preview; adding or deleting Markdown updates the list. The candidate is preserved by document ID, and the current vertical and horizontal positions are clamped to the new content. If the current document becomes unavailable, its previous preview stays visible with an error. Watch errors are reported in the footer.
- `--no-watch` disables detection, polling and automatic list updates. Restart to discover new files in this mode; Enter rereads an existing selection. No files are written by the reader.
- `--help` and `--version` work without entering terminal mode.
- A minimum size of 80 columns by 24 rows is recommended. Smaller windows show a size notice and still allow exit.
- The reader removes terminal control sequences from document text and file labels. Tabs become spaces; Unicode text is normalized for display. Files are not modified.
- Terminal display can vary with emoji and fonts. Forced process termination or terminal disconnection cannot guarantee restoration.

## Manual check

Open two real Markdown files. Confirm the empty preview, file/page navigation, Enter, document/page navigation, Escape, second selection and q. Repeat exiting with Ctrl+C.
Resize below 80x24 and back; verify the size notice and recovery. Check Japanese and long lines.
Delete a listed file before opening it; verify the error and the ability to select another file or exit.
After exit, confirm the original screen, visible cursor and normal shell typing/Enter.

Try the [representative document](tui-sample.md) with `kendai --tui -t doc/tui-sample.md`. Open it with Enter and press Tab repeatedly. Check nested formatting, Japanese wrapping, same-line links, the final target and resizing. Use `NO_COLOR=1` to check structure without colors. Terminal appearance depends on the font and terminal capabilities.

In the sample's tables, check Japanese wrapping, empty cells and all three alignments. At an 80-column window, use Right until the `LAST` column is visible and Left to return to `START`. Tab to the link and resize between 80 and 120 columns; the selected link's first character should remain visible. Escape then Left / Right must preserve the preview; Enter must restore its position.

Search for `日本語` with `/`, confirm with Enter and cycle with `g` / `G`. Use `o` to select a heading. Select a local link with Tab and open with Enter, then use `<` and `>` to return and go forward. Edit the open file in another editor and add/delete a Markdown file under a selected directory; confirm content and list updates without losing your reading position. Repeat with `--no-watch` and confirm that automatic updates stop.

Select the sample's Workflow image with Tab and press Enter. Check the default application's result, return to the terminal and verify the reading position. Try the linked image's outer link and image as separate selections. Select the missing and remote examples and confirm that they report errors while leaving reading and quitting usable. Try the table image at 80 and 120 columns.
