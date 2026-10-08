# Project guidance

- Communicate with the project owner in Japanese.
- Write UI text, code comments, and identifiers in English.
- Keep this project in Node.js and TypeScript.
- Keep document rendering local. Ask before adding an external service.
- Do not add HTML or PDF export features.
- Keep target paths relative to the caller's working directory, and packaged assets relative to the installed CLI.
- Test contracts, branching logic, file access boundaries, and important UI state decisions. Use integration tests for HTTP and file-watching behavior.
- Run `npm run check` before handing off code changes.
- If Python tools become necessary, install them in a virtual environment.
- Use a Markdown body file with `gh pr create --body-file` and `gh pr edit --body-file`, then verify line breaks with `gh pr view`.
