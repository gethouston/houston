### Issue for this PR

Closes #

### Type of change

- [ ] Bug fix (`fix:`)
- [ ] New feature (`feat:`)
- [ ] Refactor / code improvement (`refactor:` / `style:`)
- [ ] Documentation (`docs:`)
- [ ] Chore / tooling / CI (`chore:` / `ci:` / `test:`)


### What does this PR do?

Please describe the problem, the changes you made, and why they work. It is expected that you understand why your changes work — if you do not, at least say so, so a reviewer knows how much to trust the PR.

**If you paste a large clearly AI generated description here your PR may be ignored or closed!**

### How did you verify your code works?

List the commands you ran and what you manually tested. Examples:

- `cargo test --workspace` (engine)
- `pnpm typecheck` (ui/)
- `cd app && pnpm tsc --noEmit` (app frontend)
- `cd app/src-tauri && cargo check` (app backend)
- `cd app && pnpm check-locales` (i18n)
- Manual: ran `pnpm tauri dev`, walked through the affected flow in the desktop app

If the engine changed, did you rebuild the sidecar (`cargo build -p houston-engine-server`) before re-running `pnpm tauri dev`?

### Screenshots / recordings

_If this is a UI change, please include a screenshot or recording._

### Checklist

- [ ] I have tested my changes locally
- [ ] I have not included unrelated changes in this PR
- [ ] Tests added or updated for the behavior I changed (engine: `cargo test`; ui/app: matching test files)
- [ ] No file exceeds 200 lines (CSS 500) — extracted modules if needed

_If you do not follow this template your PR will be automatically rejected._
