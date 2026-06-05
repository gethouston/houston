# Agentic Workspace Substrate — F1 (visible git-backed root + developer mode)

**TL;DR.** F1 of the agentic-workspace arc is implemented, fully unit-validated, adversarially reviewed (P20) and fixed, and pushed as **PR gethouston/houston#446** — but it is **not merged** (the `broomva` token lacks write access to `gethouston/houston`) and has **not had a real-app runtime check**; **FIRST ACTION: run `cd app && pnpm tauri dev`, exercise Settings → Advanced → Developer mode → Workspace location → pick a folder → restart → confirm the tree migrated, then have a gethouston maintainer merge #446.**

## State of the world (P15 snapshot 2026-06-04)

- **Houston** (`gethouston/houston`) — working branch `open-existing-workspace-folder`, tracking `fork/open-existing-workspace-folder` (remote `fork` = `broomva/houston`; remote `origin` = `gethouston/houston`, **broomva has no push/merge access → 403**). **4 ahead / 0 behind** `origin/main` (`e8919db`). Tree clean.
- **PR #446** — `OPEN`, `mergeable: MERGEABLE`, `mergeStateStatus: CLEAN`, no CI checks reported (gethouston runs Actions only after maintainer approval on fork PRs). Blocked solely on merge permission.
- **Daemons** — none running. No dev server / engine was started this session (validation was unit-tests + typecheck only). To run: `cd app && pnpm tauri dev` (rebuild the engine first if `engine/**` changed: `cargo build -p houston-engine-server`).
- **Deps** — this worktree had **no `node_modules`** until `pnpm install` was run this session; if you re-clone, run `pnpm install` before `pnpm tsc`.

## What F1 delivered (one PR, 4 commits — so the next agent doesn't redo it)

| Commit | Files | What it gave |
|---|---|---|
| `8bfcc50` | `docs/agentic-workspace-substrate.{md,html}` | The whole-arc design (env-not-build reframe, two-root split, F0–F2 + C1–C5, session↔KG). Canonical spec + rich HTML. |
| `0c45df5` | `app_config.rs` (new), `git_repo.rs` (new), `state.rs`, `lib.rs`, engine `lib.rs`, `Cargo.toml` | **C1** docsRoot resolution at boot (default unchanged); **C4** `ensure_docs_root_git` (idempotent git-init, skips hidden root, degrades w/o git); **C5** `migrate_docs_root`. |
| `d011e6d` | `commands/workspace_root.rs` (new), `use-developer-mode.ts` (new), `advanced.tsx` (new), `os-bridge.ts`, `settings-view.tsx`, `commands/mod.rs`, `lib.rs`, `locales/*/settings.json`, `agent-manifest.md` | **C2** developer-mode toggle (off by default); **C3** `get/set_docs_root` + Settings → Advanced → Workspace location. |
| `ae2e626` | `app_config.rs`, `git_repo.rs`, `workspace_root.rs`, `lib.rs`, `advanced.tsx`, `locales/*/settings.json` | **P20 fixes:** boot-time (pre-engine) migration; EXDEV-safe + resumable move; `.gitignore`-only initial commit + broadened ignore; canonicalized home-skip; absolute-path persistence + input validation; legacy→docs_dir; no silent catch. |

**Default behavior is unchanged** — `docsRoot` unset → `~/.houston/workspaces/`. The visible-root path only activates when a user opts in via Settings.

## E2E proof (re-runnable any time)

```bash
# Rust (engine + app crates) — from repo root:
cargo test -p houston-engine-core git_repo     # 6 passed
cargo test -p houston-app app_config           # 11 passed (incl. EXDEV-resume, nesting/equal guards)

# TypeScript + locales — from app/ (run `pnpm install` first if node_modules absent):
cd app && pnpm tsc --noEmit                     # 0 errors
pnpm check-locales                              # en/es/pt in sync
```

## First action

```bash
cd /Users/broomva/conductor/workspaces/houston/lansing
cargo build -p houston-engine-server   # stage the sidecar (engine changed)
cd app && pnpm tauri dev
# Then, in the app: Settings → Advanced → toggle "Developer mode" on →
#   "Workspace location" → Change → pick e.g. ~/Houston → restart Houston →
#   confirm: ~/Houston exists, is a git repo (`git -C ~/Houston log`),
#   workspaces moved out of ~/.houston/workspaces, agents still load.
```
This is the **P11 gate** I could not close headlessly; it must pass before #446 merges (it's a data-migration feature). If it passes, ping a `gethouston/houston` maintainer to merge #446 (squash).

## Pickup state (what's open)

- [ ] **Merge #446** — needs a maintainer with write to `gethouston/houston` (broomva is 403). PR is CLEAN/MERGEABLE.
- [ ] **Runtime-verify the migration** (the First action above) — the only validation gap.
- [ ] **First-run onboarding root-pick screen** — deferred from C3. Capability ships via Settings; the tutorial-flow placement (`personal-assistant-onboarding.tsx` / welcome gate) needs the same `pnpm tauri dev` verification.
- [ ] **Next arc foundations:** **F0** runtime bundling (python3/git/gh/bash/node into the installer) and **F2** agent environment + skill rail (`BROOMVA_ROOT` per session, vendor the bstack roster via the Store `.agents/skills/*` rail) — see the design doc §7.

## Related context

- Design (canonical + rich): `docs/agentic-workspace-substrate.md` / `.html`
- Memory: `agentic-workspace-substrate-arc.md` (the arc), `advanced-settings-feature-shape.md` (now annotated STALE — no FLAG_REGISTRY exists; use the `tauriPreferences`+settings pattern from `use-developer-mode.ts`)
- The P20 cross-review findings + their fixes are spelled out in commit `ae2e626`'s body.
