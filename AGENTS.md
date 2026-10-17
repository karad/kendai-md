# Project guidance

- Write UI text, code comments, and identifiers in English.
- Keep this project in Node.js and TypeScript.
- Keep document rendering local. 
- Ask before adding an external service.
- Keep target paths relative to the caller's working directory, and packaged assets relative to the installed CLI.
- Test contracts, branching logic, file access boundaries, and important UI state decisions. Use integration tests for HTTP and file-watching behavior.
- Run `npm run check` before handing off code changes.
- If Python tools become necessary, install them in a virtual environment.
- Use a Markdown body file with `gh pr create --body-file` and `gh pr edit --body-file`, then verify line breaks with `gh pr view`.

## SpecKit

- This project follows Spec-Driven Development using SpecKit (https://github.com/github/spec-kit).
- Do not publish SpecKit-related files (such as `specs/`, `.specify/`, and `.codex/prompts/`) to the OSS repository.
- Public code, public documentation, and CI tests must not depend on `specs/`, `.specify/`, or `.codex/prompts/`, which are excluded from the OSS repository. All references in tests and implementations must resolve entirely within files included in the OSS repository.
- Consult the project owner if an exceptional situation arises, such as an implementation problem that is difficult to resolve, insufficient permissions, a required architecture change, or a need to deviate from the specification.

## Milestone documentation

- Keep only milestones that are in progress or have not yet been closed out in `MILESTONE.md`.
- Move details of completed milestones into individual files under `docs/milestones/archive/`.
- Do not leave detailed entries for completed milestones in `MILESTONE.md`.
- Retain a status snapshot and links to the archives in `MILESTONE.md`.
