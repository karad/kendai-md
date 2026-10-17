# Terminal reader validation

The production terminal reader is in `src/tui/` and starts with `kendai -T`. All development checks use the repository's root package and lockfile. The earlier `experiments/cli-tui` prototype has been retired.

## Run the checks

From a source checkout with development dependencies installed:

```sh
nvm use 24.22.0
npm run check
npm run test:tui:pty
npm run benchmark:tui
npm run test:package
```

`test:tui:pty` requires macOS, `/usr/bin/script` and an interactive terminal. Run it directly in a terminal. The normal test runner gives workers piped input, so its six PTY cases are reported as skipped; they must be run separately. The dedicated command exits with an explanation on unsupported or non-interactive environments instead of reporting an all-skipped success.

The package check installs temporary packages offline. Required dependency tarballs must already be in npm's cache. An `ENOTCACHED` result means the package check did not complete; it is not a TUI test result. If your npm policy disables lifecycle scripts, allow the project's `prepare` build for the verification process; it must compile Git-source installations. Do not change your global npm policy merely to run this check.

No check publishes a release. The normal tests and package check use a fake image launcher and never open an external application.

## What is verified

| Earlier prototype check                          | Production replacement                                                                                        | Decision                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| State transitions and candidate bounds           | `test/tui-model.test.ts`, `test/tui-session.test.ts`                                                          | Covered by current state and asynchronous navigation tests     |
| Safe text, Unicode wrapping and Markdown targets | `test/tui-text.test.ts`, `test/tui-markdown.test.ts`, `test/tui-table.test.ts`, `test/tui-navigation.test.ts` | Covered by current renderer and search contracts               |
| Empty preview, Enter, Escape and size recovery   | `test/tui-app.test.tsx`                                                                                       | Covered with real files and current UI                         |
| Non-TTY rejection                                | `test/tui-cli.test.ts`                                                                                        | Existing production CLI coverage retained                      |
| PTY restoration                                  | `test/tui-terminal.test.ts`, `test/fixtures/tui-pty-driver.ts`                                                | Replaced with production `Library` and `runTui`                |
| Synthetic reducer benchmark                      | `scripts/benchmark-tui.mjs`                                                                                   | Replaced with real discovery, session and viewport processing  |
| Prototype app, fixtures and dependency tree      | Root `src/tui/`, `test/`, `package.json`, `package-lock.json`                                                 | Prototype implementation and its isolated dependencies removed |

PTY checks cover q, Ctrl+C, SIGINT, SIGTERM, a caught render failure and resize recovery. They verify `stty -g`, alternate-screen exit, cursor visibility, removal of the application's own signal handlers and natural process completion with watching enabled. A render failure is injected only by the test fixture; the public CLI has no crash option. Ink's process-wide cursor-restoration hook is allowed to remain until process exit.

File and image access, deleted or replaced files, external and malformed references, late asynchronous responses, watcher shutdown and image-launch errors are covered by the production library, session, watcher and launcher tests. The browser HTTP checks remain part of `npm run check`.

## Reproducible performance probe

`benchmark:tui` compiles production code, creates 1,000 temporary Markdown files and a deterministic 10,000-line Japanese document, then removes the fixture. The document includes combining marks, emoji, headings, links, tables and code. The report includes:

- Discovery time, session open/layout time and literal search time.
- Median, p95 and maximum for 100 session page movements with visible-line highlighting and table clipping.
- Input bytes, source/display lines, file/target/match counts, Node/OS/architecture and RSS/heap measurements.
- Reference targets: discovery, open and search each below 5 seconds; movement/viewport p95 below 50ms.

Timing targets describe this local reference workload, not a guarantee for arbitrary machines or documents. The report's `withinReferenceTargets` must be checked along with the actual timings. Memory is sampled for the benchmark process, not a fixed application memory limit. React rendering, terminal painting, physical keyboard latency and the image viewer are **not** measured.

## Environment and manual checks

| Environment                   | Automated coverage                                                                | Remaining confirmation                                              |
| ----------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| macOS arm64, Node.js v24.22.0 | Production PTY lifecycle, file watching, package installation and logic benchmark | Terminal.app/iTerm and font-specific visual appearance              |
| Linux / WSL                   | Shared renderer/state contracts and simulated Linux image-launch arguments        | Real terminal lifecycle, desktop association and `xdg-open`         |
| Windows                       | Shared renderer/state contracts and simulated PowerShell image-launch arguments   | Windows Terminal/PowerShell lifecycle and default image application |

A minimum 80x24 terminal is required for reading; smaller windows show an exit-capable notice. Test at 80 and 120 columns and resize below the minimum and back. Try `NO_COLOR=1`, Japanese, emoji, combining marks, long lines and wide tables; character-cell appearance can depend on the terminal and font. Run the [terminal reader manual checks](tui.md#manual-check) for the complete input, history, search, watcher and image flow.

After q and Ctrl+C, verify the original screen, visible cursor and normal shell typing/Enter. SIGKILL, terminal disconnection and operating-system crashes cannot guarantee recovery. Physical terminal and image-viewer visual checks are distinct from PTY byte-level assertions.

### Reference run: 2026-10-17

One local run on macOS arm64 (Darwin 27.0.0), Node.js v24.22.0, width 54 and page height 20:

| Measurement                                |                 Result |
| ------------------------------------------ | ---------------------: |
| Markdown files                             |                  1,000 |
| Source / display lines                     |        10,000 / 10,018 |
| UTF-8 source bytes                         |                287,891 |
| Navigation targets / search matches        |          4,978 / 4,969 |
| Discovery                                  |                9.13 ms |
| Session open and layout                    |              211.68 ms |
| Search                                     |              136.43 ms |
| 100 movements and viewport processing, p95 |                2.32 ms |
| Movement maximum                           |               11.92 ms |
| RSS / heap after the probe                 | about 303 MiB / 57 MiB |

All reference timing targets were met. These are logic/viewport measurements; React rendering and terminal painting were excluded. Re-run the command for your own workload and environment.
