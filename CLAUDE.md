# Claude Session Protocol — Houston

Caveman style. Progressive discovery. Load on demand.

---

## RULE 0 — NEVER TAKE SHORTCUTS

**This is the highest rule. It outranks every phase, every dispatch, every "be efficient" instinct.**

If a faster path and a better path both exist, the better path wins. Always. Even if "better" means 40 directory renames, 28 cross-reference fixes, a doc update, a test rewrite, and a hash bump. Volume of work is not a reason. "It would still work" is not a reason.

**Watch for these shortcut patterns in your own thinking:**

- "This avoids the rename / refactor / doc update / migration." → That's labor, not a reason. Do the work.
- Adding an override / opt-out / fallback field to paper over a bad name or bad shape. → Fix the underlying name or shape.
- Skipping a typecheck / test / build because it's slow or set-up-heavy. → Run it.
- Keeping legacy compatibility "just in case" inside internal code. → Delete it (per the existing no-backwards-compat rule).
- Generating bulk content with a script when each item deserves real thought. → Do the items by hand.
- Writing a TODO / FIXME / "we can clean this up later." → Clean it up now.
- Declaring something done before the verification step actually passed. → Not done.
- Picking the smallest example to demo on without asking the user. → Ask.

**Self-audit at the end of every meaningful chunk of work:**
> "Where did I cut a corner? Was it because the better path was wrong, or because it was just longer?"
>
> If "just longer" — go back and do it right.

This rule was added because the model defaulted to a shortcut (a `display_name` schema override instead of renaming 40 slugs) and the user had to push back. Don't make the user push back. Catch yourself first.

---

## PHASE 0 — Load /caveman (EVERY SESSION, FIRST)

Before any action: invoke `/caveman` skill. Stay terse. Drop articles, filler, pleasantries. Technical substance stays. Code blocks unchanged.

Default level: `full`. Switch via `/caveman lite|full|ultra`.

Off only if user says "stop caveman" or "normal mode".

---

## System at a glance (read once at session start)

Houston = desktop app + standalone engine + open library of agents.

- **`app/`** — Tauri 2 desktop. React frontend, small Rust binary that spawns the engine as a sidecar subprocess and talks to it over HTTP/WS. OS-native glue only (file pickers, reveal-in-file-manager, logs). No domain logic.
- **`engine/`** — Rust crates. `houston-engine-core` = runtime/domain. `houston-engine-protocol` = wire types. `houston-engine-server` = axum HTTP+WS binary (`houston-engine`). `houston-agent-files`, `houston-skills`, `houston-sessions`, `houston-file-watcher`, etc. are leaf crates. Frontend-agnostic: no Tauri, no React.
- **`ui/`** — `@houston-ai/*` React packages (chat, board, layout, engine-client, …). Props-only, no store imports. `@houston-ai/engine-client` is the TS front door to the engine.
- **User data** — `~/.houston/`: DB, logs, `engine.json`, and `workspaces/<Workspace>/<Agent>/`. Each agent has `.houston/` data files + `CLAUDE.md` + `.agents/skills/`.
- **Wire contract** — every domain call is a `fetch` or WS frame in `@houston-ai/engine-client`. There are NO `invoke("list_workspaces", …)` style Tauri commands for domain; those were all deleted.
- **Reactivity** — engine emits `HoustonEvent`s; desktop subscribes to the WS `*` firehose; TanStack Query invalidation in `app/src/hooks/use-agent-invalidation.ts` maps events → query keys. File watcher catches direct agent writes.
- **Voice** — agents' target user is NON-technical. The product system prompt forbids mentioning files/JSON/configs/CLIs when talking to the user. Lives in `app/src-tauri/src/houston_prompt.rs` (Houston app), NOT in the engine. Engine is prompt-agnostic; app hands it over at spawn via `HOUSTON_APP_SYSTEM_PROMPT`.

Before touching anything: run PHASE 1 (load `knowledge-base/architecture.md` + any KBs relevant to scope).

## Dispatch table (progressive discovery)

Deploying / shipping a release? → `/release`
Manual macOS build, notarize, staple? → `/build-app-local`
Bug? Don't guess → `/debug`

Need specific knowledge? Load on demand:
- Repo shape, products, engine story → `knowledge-base/architecture.md`
- Colors, typography, components, animation → `knowledge-base/design-system.md`
- `.houston/` layout, schemas, reactivity → `knowledge-base/files-first.md`
- Skills on disk + UI, picker, invocation marker → `knowledge-base/skills.md`
- Agent manifest, tiers, sidebar, workspaces → `knowledge-base/agent-manifest.md`
- Engine wire protocol (REST + WS) → `knowledge-base/engine-protocol.md`
- Provider error taxonomy + classifier contract → `knowledge-base/provider-errors.md`
- `houston-engine` binary ops → `knowledge-base/engine-server.md`
- Bundled CLIs (codex universal, composio per-arch) + runtime claude-code installer → `knowledge-base/cli-bundling.md`
- Windows testing loop from a Mac (UTM VM, SSH bridge, cross-compile, log fetch) → `knowledge-base/windows-testing.md`
- Custom frontend on `houston-engine` (integration reference) → `examples/smartbooks/README.md`
- Mobile PWA (tunnel, pairing, reactivity) → `docs/mobile-architecture.md` + `docs/relay-operations.md`
- Updater, analytics, Sentry, env vars, CI → `knowledge-base/production-infra.md`
- Supabase auth, Google SSO, Keychain → `knowledge-base/auth.md`
- Translating UI strings, namespaces, ui/ labels prop pattern, `t()` rules → `knowledge-base/i18n.md`

Design work? Skills: `/critique` before, `/polish` after. Else `/clarify` (copy), `/distill` (overloaded screen), `/animate` (micro-interactions), `/audit` (a11y).

---

## Phases (follow IN ORDER)

Print phase name so user knows protocol active.

**STOP-AND-WAIT rule:** When told "wait for approval" / "ask user" — end turn NOW. No anticipating. No next phase.

### PHASE 1 — Load Context (session start only)
Read `knowledge-base/architecture.md` + any KBs relevant to scope. Name what you loaded.

### PHASE 2 — Understand
Read files user references. Identify direction: library-first / app-first / single-layer. Ask clarifying Qs if anything unclear. **STOP if asked.**

### PHASE 3 — Challenge
Push back on request if better approach exists. Check:
- Library or app? Generic → ui/engine. App-specific → app/.
- Which package? Exists already?
- Props generic? No store imports? No app-specific types?
- Does this fit chat-first planning/delegation?

Approach sound → say so. Better path exists → say it clearly, no sugarcoat. **STOP until user agrees.**

### PHASE 4 — Plan
Numbered steps. Mark area per step: `[ui/board]`, `[engine]`, `[app]`. Group into testable chunks. Library before app. **STOP for approval.**

### PHASE 5 — Execute chunk
Print chunk + area. Do all steps. Brief summary. Continue.

### PHASE 6 — Test
Run checks for what touched. Rust → `cargo test`, not just check. Fix failures.

### PHASE 7 — Verify
Full verification. UI touched? Visual fidelity check. Say "Ready for testing — verify + report." **STOP.** Issue? Add logging first (see `/debug`), never blind fix.

### PHASE 8 — Refactor
Library boundary leak? API clean? File > 200 lines (CSS > 500)? Duplication across ui/ + app/? Propose + do after approval.

### PHASE 9 — Cleanup
Unused imports, dead code, debug artifacts. ui/ → no `@/`, no Zustand, no Tauri. app/ → no duplicated logic.

### PHASE 10 — Document
Check + update all affected docs: `knowledge-base/*.md`, skills, showcase. Update now, not propose.

### PHASE 11 — Complete
Summarize. Needs NEW KB entry? New pattern / architecture decision / gotcha / design precedent. Propose if yes.

### PHASE 12 — Commit
Ask: "Ready to commit? (yes/no/skip)" **STOP.** Yes → stage specific files, conventional commit, push `claude/wip`. Never `git add -A`.

---

## Test commands

| Area | TS | Rust | Full build |
|------|----|------|------------|
| ui/ | `bun run typecheck` | — | — |
| engine/ | — | `cargo test --workspace` | `cargo build --workspace` |
| engine/ Win check | — | `cargo check --target x86_64-pc-windows-gnu -p houston-engine-server` (needs mingw-w64) | — |
| app/ | `cd app && bunx tsc --noEmit` | `cd app/src-tauri && cargo check` | `cd app && bun run tauri build` |
| app/ Win MSI | — | — | `cd app && bun run tauri build --target x86_64-pc-windows-msvc` (needs Windows host or `xwin` SDK) |
| app/ i18n | `cd app && bun run check-locales` | — | — |
| CLI bundle (mac) | — | — | `./scripts/fetch-cli-deps.sh both` |
| CLI bundle (win) | — | — | `./scripts/fetch-cli-deps.sh windows-x64` (Bun + jq + zstd required) |

### Engine sidecar staleness (dev only)

`bun run tauri dev` spawns the engine as a subprocess from `app/src-tauri/binaries/houston-engine-<triple>`, which `build.rs` stages from `target/{debug,release}/houston-engine`. Tauri does NOT rebuild the engine on its own — frontend HMR works fine but the sidecar is whatever binary was last compiled.

**Rule**: any time a PR touches `engine/**` (including merges that bring engine changes from `main`), run `cargo build -p houston-engine-server` BEFORE the next `bun run tauri dev` and restart it. Symptoms of a stale sidecar: 404s on routes that exist in the current source, missing event types, schema mismatches. Production users never hit this — release CI builds the engine from scratch on every tag.

---

## Hard rules (ALWAYS)

### Debugging
**Never guess.** Read logs first. See `/debug`.

### Library boundary (ui/)
- Generic reusable → ui/. App-specific → app/. Unsure → start in app/, extract later.
- **Props over stores, always.** No Zustand/Redux/etc imports in ui/.
- No app/ types in ui/. Use generic types (`BoardItem`, `FeedItem`, `ChatMessage`).
- No `@/` path aliases in ui/. Relative imports within package. Package imports between.

### Engine boundary
- `engine/` = frontend-agnostic. No Tauri. No React. No webview assumption.
- Tauri-specific code → `app/houston-tauri/` (the adapter).

### Adding a provider
New AI provider = one new adapter file in `engine/houston-terminal-manager/src/provider/<name>.rs` implementing `ProviderAdapter`, one entry in `REGISTRY`, three dispatch arms (runner spawn in `session_dispatch.rs`, NDJSON parser in `session_io.rs`, title summarizer in `sessions/summarize.rs`). All other call sites pick the new provider up automatically through `Provider::from_str` and the registry. `Provider` is a `Copy` newtype around `&'static dyn ProviderAdapter`, NOT an enum, so no variant additions are needed.

**Error classification** is part of the adapter — implement `classify_stderr` and `classify_result_error` to map this provider's failure patterns to the shared `ProviderError` taxonomy (`RateLimited`, `QuotaExhausted`, `Unauthenticated`, ...). Real CLI fixtures > guessed regex; unit-test each classifier with verbatim stderr / NDJSON snippets. The frontend already renders every variant (`app/src/components/shell/provider-error-card.tsx`) — no UI work unless you need a custom status-page URL or a provider-specific reconnect flow.

See `knowledge-base/architecture.md` (engine crates), `knowledge-base/agent-manifest.md` (provider/model table), and `knowledge-base/provider-errors.md` (full taxonomy + classifier contract) for the full picture.

### AI-native reactivity
- Every `.houston/` data surface must react to file changes regardless of who wrote (user via UI, agent via file write, external edit).
- All `.houston/` fetching → TanStack Query + event invalidation. No load-on-mount-only.
- Agent writes emit events. File watcher catches bypass writes. Both architecturally required.
- Never build "agent can do X but UI won't show until refresh."

### Internationalization (frontend)
- Houston ships **en / es / pt**. Every user-facing string flows through `t()` from `react-i18next`. No literal English in JSX text, props, placeholders, aria-labels, toast titles, error messages, or `<Empty>` defaults.
- New screen / new strings → pick the right namespace under `app/src/locales/<lang>/<ns>.json` (or create one + register in `app/src/lib/i18n.ts` + augment `app/src/types/react-i18next.d.ts`). en is source of truth; es and pt mirror the structure.
- **`ui/@houston-ai/*` stays i18n-agnostic** per the library boundary. Components take optional `labels?` props with English defaults; the consumer in `app/` passes `t()` results in. Don't import `react-i18next` in `ui/`.
- Variables: `t("key", { name })`, never string concat. Plurals: `count` API with `_one` / `_other` keys. Embedded markup: `<Trans components={{...}}>`.
- **No em dashes (`—`)** in user-facing copy. Commas or sentence breaks. Validator enforces this.
- Spanish = Latin-American neutral (computador, tú). Portuguese = Brazilian (você).
- Keys are type-checked via `app/src/types/react-i18next.d.ts` augmentation — typos fail at compile time.
- Pre-commit: `bunx tsc --noEmit` AND `bun run check-locales` (catches missing keys, shape drift, placeholder parity, em dashes).
- See `knowledge-base/i18n.md` for patterns, glossary, and the wiring checklist.

### Internal code = no backwards compat
- Types, APIs, Rust modules, TS fns: change = change. No "just in case" keeps.
- **User data = different.** Canonical location is `~/.houston/**` (workspaces live at `~/.houston/workspaces/`). Shape/layout changes inside `~/.houston/<agent>/.houston/**` need an **idempotent migration** in `houston_agent_files::migrate_agent_data`. Never break existing users.
- **Legacy `~/Documents/Houston/**`** — earlier versions used this path. We do NOT auto-migrate from there; if a user upgrades they may need to copy their workspaces manually. When introducing further root moves, propose a migration story before executing.

### Tests mandatory
Every feature gets tests. No exceptions. Tests don't count toward 200-line limit.

### Type safety over strings
Domain concepts (status, classification) MUST be enums. TS → discriminated unions. Rust → enums w/ Display/FromStr.

### No silent failures (beta-stage policy)

We are in beta. Every error a user-initiated action can produce MUST reach the user as a visible toast with a "Report bug" affordance. Silent fallbacks rob us of the bug report — we WANT the noise.

**Banned patterns (Rust):**
- `let _ = <fallible>` / `let _ = <fallible>.await` — discarding a `Result`
- `.ok()` to drop a Result on the floor
- `.unwrap_or(...)`, `.unwrap_or_default()`, `.unwrap_or_else(|_| ...)` over an op the user initiated
- `match x { Ok(v) => ..., Err(_) => <log + default> }` — log-and-continue
- catch-and-`tracing::warn!`-and-continue inside loops where the user expected progress (the `install_from_repo` "skip" pattern is the canonical anti-example)
- `unwrap()` / `expect()` outside of test code or genuine compile-time invariants

**Banned patterns (TypeScript):**
- `.catch(() => ...)` returning `null` / `[]` / `{}`
- `try { ... } catch { ... }` with no rethrow and no toast
- `try { ... } catch (e) { console.error(e) }` — log only, no surface
- React Query `onError` that toasts a generic string instead of `errorMessage(err)`
- Top-level event handlers that fire-and-forget a Promise with no `.catch`

**Required surfacing path:**
Engine `SkillError` / `CoreError` → `ApiError` → TS `errorMessage(err)` → toast hook → user sees the real reason AND a Report-bug button that bundles the most recent engine + app log tail.

**The one exception:** `tracing::error!` from event-emit / file-watcher callbacks where there is no UI thread to toast on. Everything else surfaces.

When unsure: don't swallow. A noisy beta is a productive beta.

### No hover-only affordances
Interactive elements visible without hovering. Hover may enhance, never gate.

### File size limits
200 lines/file (excluding tests). CSS 500. **NEVER compress to fit.** Extract modules.

### Search before building
shadcn/ui registry, @houston-ai showcase, existing components, npm — before writing from scratch.

### Be critical, not agreeable
Never "You're absolutely right!" if better approach exists. Say it.

---

## Git — Worktree workflow (ALWAYS)

User ALWAYS runs Claude in a per-task worktree. Each task = isolated branch in `.claude/worktrees/<name>/`. Main stays clean.

### Remotes (fork-first)

Houston is a friendly fork. We always have two remotes:
- `origin` → `gethouston/houston` — upstream, broomva CANNOT push or merge directly.
- `fork`   → `broomva/houston`   — broomva owns this; push + self-merge are allowed.

The fork-first rule: **commit lands in the fork remote first via a self-merged fork PR, then a companion PR is opened against upstream `origin/main` for maintainer review.** Never push the worktree branch to `origin` directly — broomva doesn't have the permission and the push will 403.

### Branch model

- `main` — releasable, protected, PRs only (both on fork and upstream).
- `<worktree-name>` — the worktree's own branch (auto-created on worktree spawn); upstream-facing PRs use this branch.
- `fork/<worktree-name>` — fork-side companion branch, rebased on `fork/main` so it merges cleanly against the fork's extra commits. Use a slashed prefix so the fork commit-message convention (`Merge branch fork/<name>`) stays consistent with existing history.

### End-to-end flow (fork-first, then upstream)

Run without asking, unless a step is destructive and not pre-authorized.

1. `git branch --show-current` → confirm it's the worktree branch. Never switch to `claude/wip` or `main`.
2. Stage specific files (never `git add -A`).
3. Conventional commit (`feat:` `fix:` `docs:` `chore:` `refactor:` `style:` `test:`).
4. **Fork side — push and self-merge first:**
   a. `git fetch fork main`.
   b. `git checkout -b fork/<worktree-name> fork/main`.
   c. `git cherry-pick <commit-sha>` to bring the fix on top of `fork/main`. Cherry-pick beats rebase here: it avoids replaying upstream commits (e.g. `release.yml` bumps) that the fork already absorbed via merge commits and would otherwise conflict.
   d. `git push -u fork fork/<worktree-name>`.
   e. `gh pr create --repo broomva/houston --base main --head fork/<worktree-name> --title "<conventional-title> — fork-side companion to upstream #<n>" --body "..."`. Body includes a one-line "Fork-side companion to upstream PR" link (the upstream number may not exist yet — open the upstream PR right after and edit the body to add the link if so).
   f. `gh pr merge <num> --repo broomva/houston --squash --delete-branch --auto`. Fork main is protected with required `CI Success`; `--auto` queues the merge to fire once CI passes. Don't poll — the harness notifies on completion or the next turn surfaces the merged state.
5. **Upstream side — open the companion PR (no self-merge):**
   a. The worktree branch is already based on `origin/main`, so it pushes cleanly to fork without rebasing.
   b. `git push -u fork <worktree-branch>` — push the upstream-targeted branch into the fork (upstream PRs require the head ref to live in a repo broomva controls).
   c. `gh pr create --repo gethouston/houston --base main --head broomva:<worktree-branch> --title "..." --body "..."`. The upstream PR awaits maintainer review + merge.
6. Cleanup: `git worktree remove <path>` is handled by the harness on exit; the fork branch is deleted automatically by `--delete-branch`. The upstream branch on the fork stays until the upstream PR is closed/merged.

### Hard prohibitions

Never `git reset --hard` on either `main`, never force-push to either `main`, never merge a fork PR with `--admin` to bypass the `CI Success` check (CI is the only gate that catches regressions before the fork's `main` updates), never open a fork PR with `--head` pointing at an unrebased branch (the conflict between the fork's extra commits and upstream's release-CI bumps will block the merge — cherry-pick onto `fork/main` instead).

---

## Secrets
Signing identities, team IDs, API keys, issuer UUIDs: env vars only. Never literals in committed files. Read via `option_env!()` (Rust compile-time) or env vars (CI).

---

## Permission scope
User approved once ≠ approved in all contexts. Unless durable instructions authorize, confirm first for:
- Destructive ops (delete files/branches, drop tables, rm -rf)
- Hard-to-reverse (force-push, git reset --hard, amend published, remove deps)
- Shared-state (push, PR create/comment, Slack/email send)
- Third-party uploads (diagram renderers, pastebins — could be indexed)

Match action scope to what was actually requested.
