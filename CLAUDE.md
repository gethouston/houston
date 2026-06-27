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

> **⚠️ Houston is mid-convergence to ONE engine. Read this before trusting the older `knowledge-base/` docs — many still describe the legacy Rust engine.** Source of truth for the new architecture: **`convergence/README.md`**.

**Two engines coexist right now.** The Rust `engine/` is the *current default* desktop build (releasable, instant rollback). The TARGET — flag-gated (`VITE_NEW_ENGINE` / `VITE_NEW_ENGINE_URL`) and being proven — is ONE deployment-agnostic TypeScript engine for **both desktop and cloud**: the **pi runtime** (`packages/runtime`, the only agent loop) behind a **host** (`packages/host`, `@houston/host`) with **local vs cloud adapter profiles** wired in `main()`. The CLOSED cloud adapters (Pg/Gcs/Gke/Redis + operator-admin + cloud `main.ts`) are extracted into `packages/host-cloud` (`@houston/host-cloud`); the open/closed seam is documented in `BOUNDARY.md` and machine-enforced by `scripts/check-boundaries.mjs` (`pnpm check:boundaries`). Domain logic lives once in `packages/domain`; wire types in `packages/protocol` (**protocol v3**). `engine/` (Rust, ~51k LOC, 17 crates) is the rollback + parity oracle, **deleted at the gated final cutover** (`convergence/final-cutover.md`) once the new path is proven in prod — never before.

**No provider CLIs in the target.** pi talks to providers in-process (Anthropic + OpenAI/Codex OAuth). The bundled CLIs (claude-code, codex, gemini) and the per-arch Composio CLI go away with `engine/`. **Gemini is dropped.** **Composio is KEPT but RE-WIRED** — an in-process REST tool behind an `IntegrationProvider` port (`packages/host/src/integrations/`), each user's own free "Composio for you" account, **no CLI**. **Removed (now actually deleted, not just planned):** mobile/tunnel/relay (`mobile/` + `houston-relay/`), the custom-frontend reference (`examples/smartbooks/`), the legacy Rust-engine VPS image (`always-on/`), worktrees, store/marketplace, claude-CLI install. Single personal workspace (teams later).

The pieces:
- **`app/`** — Tauri 2 desktop. `app/src` is the shared React frontend (also runs verbatim as `packages/web`). `app/src-tauri` is the Rust shell that spawns the engine sidecar (the Rust `houston-engine` today; the Bun-compiled TS host under `--features host-sidecar`) and talks HTTP/WS+SSE. OS-native glue only.
- **`packages/runtime`** — the **pi engine** (TS/Node in dev/test/Docker; Bun only inside the compiled desktop sidecar). Single-workspace, single-credential, tenancy-free. The ONLY agent loop in the target.
- **`packages/host`** — the **host** (cloud control plane AND local desktop supervisor: the SAME server, different adapter profiles). Serves protocol v3. OPEN package.
- **`packages/host-cloud`** — the **CLOSED** cloud-adapter package (`@houston/host-cloud`): Pg/Gcs/Gke/Redis adapters + operator-admin + cloud `main.ts`. The open/closed seam (open code never imports a cloud adapter; only host `main.ts`/`admin/**` touch concretes) is documented in `BOUNDARY.md` and enforced by `scripts/check-boundaries.mjs` (`pnpm check:boundaries`, wired into the PR CI gate `.github/workflows/ci.yml`).
- **`packages/domain` / `packages/protocol`** — shared domain logic (`.houston` layout, schemas, cron, portable) + v3 wire types/zod.
- **`engine/`** — **legacy Rust engine** (current default build; retired at P6). The `knowledge-base/engine-*.md` + `cli-bundling.md` docs describe THIS.
- **`ui/`** — `@houston-ai/*` React packages. Props-only, no store imports. `@houston-ai/engine-client` is the TS front door (rewritten to v3 transport).
- **User data** — `~/.houston/`: `workspaces/<Workspace>/<Agent>/`, each agent with `.houston/` data files + `CLAUDE.md` + `.agents/skills/`. The layout carries over to the TS engine unchanged (chat history is the only real migration).
- **Wire contract** — every domain call is a `fetch`/SSE in `@houston-ai/engine-client` (v3 against the host). No `invoke(...)` Tauri commands for domain.
- **Reactivity** — the engine emits `HoustonEvent`s on a global channel (`/v1/events` SSE in v3); TanStack Query invalidation in `app/src/hooks/use-agent-invalidation.ts` maps events → query keys. FS watcher catches direct agent writes.
- **Voice** — agents' target user is NON-technical; the product prompt forbids mentioning files/JSON/configs/CLIs. Desktop: `app/src-tauri/src/houston_prompt.rs`; TS host: `packages/host/src/houston-prompt.ts`. The engine is prompt-agnostic; the app hands it over at spawn (`HOUSTON_APP_SYSTEM_PROMPT`).

Before touching anything: run PHASE 1 (load `convergence/README.md` + `knowledge-base/architecture.md` + any KBs relevant to scope). Treat `knowledge-base/` engine/CLI docs as LEGACY (Rust engine) unless they say otherwise.

## Dispatch table (progressive discovery)

Deploying / shipping a release? → `/release`
Manual macOS build, notarize, staple? → `/build-app-local`
Bug? Don't guess → `/debug`

Need specific knowledge? Load on demand:
- **Single-engine convergence (the NEW, current-direction architecture — host + pi runtime + adapter profiles, protocol v3, Composio-as-REST) → `convergence/README.md`** ← read this before the legacy engine docs below
- Repo shape, products, engine story (convergence-aware) → `knowledge-base/architecture.md`
- Colors, typography, components, animation → `knowledge-base/design-system.md`
- `.houston/` layout, schemas, reactivity → `knowledge-base/files-first.md`
- Skills on disk + UI, picker, invocation marker → `knowledge-base/skills.md`
- Agent manifest, tiers, sidebar, workspaces → `knowledge-base/agent-manifest.md`
- _[LEGACY, Rust engine]_ Engine wire protocol (REST + WS) → `knowledge-base/engine-protocol.md` · the v3 contract is `packages/protocol/`
- _[LEGACY, Rust engine]_ Provider error taxonomy + classifier contract → `knowledge-base/provider-errors.md`
- _[LEGACY, Rust engine]_ `houston-engine` binary ops → `knowledge-base/engine-server.md` · the TS host is `packages/host` (run: `pnpm --filter @houston/host dev`)
- _[LEGACY, being retired]_ Bundled provider CLIs (codex, claude installer) → `knowledge-base/cli-bundling.md`. **Composio is NO LONGER a bundled CLI** — it's an in-process REST tool (`packages/host/src/integrations/`); pi has no provider CLIs.
- Self-host the TS engine on a VPS (Docker + Caddy TLS) → `selfhost/README.md`
- Windows testing loop from a Mac (UTM VM, SSH bridge, cross-compile, log fetch) → `knowledge-base/windows-testing.md`
- _[REMOVED]_ Custom-frontend integration reference (`examples/smartbooks/`) was deleted in the convergence sweep
- _[REMOVED feature]_ Mobile PWA (tunnel, pairing, relay) was cut; `mobile/` + `houston-relay/` are deleted — `docs/mobile-architecture.md` + `docs/relay-operations.md` are historical only
- Houston Cloud (control plane, per-turn runtime, code sandbox, credential model) → `cloud/README.md` + `cloud/code-execution.md`
- Updater, analytics, Sentry, env vars, CI → `knowledge-base/production-infra.md`
- Daily/weekly/monthly data rituals + dashboard reading guide → `knowledge-base/data-rituals.md`
- UTM conventions, campaign attribution, IRL event tracking → `growth/utm-conventions.md` + `growth/campaigns/_template.md` + `scripts/event-qr.sh`
- Supabase auth, Google SSO, Keychain → `knowledge-base/auth.md`
- Translating UI strings, namespaces, ui/ labels prop pattern, `t()` rules → `knowledge-base/i18n.md`
- Automated UI / end-to-end tests (Playwright, web build, fake host, new TS engine) → `knowledge-base/ui-testing.md` + `packages/web/e2e/README.md`

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
| ui/ | `pnpm typecheck` | — | — |
| engine/ | — | `cargo test --workspace` | `cargo build --workspace` |
| engine/ Win check | — | `cargo check --target x86_64-pc-windows-gnu -p houston-engine-server` (needs mingw-w64) | — |
| app/ | `cd app && pnpm tsgo --noEmit` | `cd app/src-tauri && cargo check` | `cd app && pnpm tauri build` |
| app/ Win MSI | — | — | `cd app && pnpm tauri build --target x86_64-pc-windows-msvc` (needs Windows host or `xwin` SDK) |
| app/ i18n | `cd app && pnpm check-locales` | — | — |
| packages/web | `pnpm --filter houston-web typecheck` (runs Tauri shim-parity guard + tsgo) | — | `pnpm --filter houston-web build` |
| packages/web UI tests | `pnpm --filter houston-web test:e2e` (Playwright; `typecheck:e2e` for the harness) — see `knowledge-base/ui-testing.md` | — | — |
| CLI bundle (mac) | — | — | `./scripts/fetch-cli-deps.sh both` |
| CLI bundle (win) | — | — | `./scripts/fetch-cli-deps.sh windows-x64` (Bun + jq + zstd required) |

### Engine sidecar staleness (dev only)

`pnpm tauri dev` spawns the engine as a subprocess from `app/src-tauri/binaries/houston-engine-<triple>`, which `build.rs` stages from `target/{debug,release}/houston-engine`. Tauri does NOT rebuild the engine on its own — frontend HMR works fine but the sidecar is whatever binary was last compiled.

**Rule**: any time a PR touches `engine/**` (including merges that bring engine changes from `main`), run `cargo build -p houston-engine-server` BEFORE the next `pnpm tauri dev` and restart it. Symptoms of a stale sidecar: 404s on routes that exist in the current source, missing event types, schema mismatches. Production users never hit this — release CI builds the engine from scratch on every tag.

---

## Hard rules (ALWAYS)

### Debugging
**Never guess.** Read logs first. See `/debug`.

### Formatting + linting (Biome) — run after EVERY change
After any TS/JS/JSON modification or addition, run **`pnpm check:fix`** before the work is "done". End state must be Biome-clean — `pnpm check` exits 0.

### Library boundary (ui/)
- Generic reusable → ui/. App-specific → app/. Unsure → start in app/, extract later.
- **Props over stores, always.** No Zustand/Redux/etc imports in ui/.
- No app/ types in ui/. Use generic types (`BoardItem`, `FeedItem`, `ChatMessage`).
- No `@/` path aliases in ui/. Relative imports within package. Package imports between.

### Engine boundary
- `engine/` = frontend-agnostic. No Tauri. No React. No webview assumption.
- Tauri-specific code → `app/houston-tauri/` (the adapter).

### Adding a provider

> _[LEGACY, Rust engine]_ The procedure below is for the Rust `engine/` (CLI-subprocess model), being retired at P6. In the **TS engine (pi runtime)** providers are in-process — Anthropic + OpenAI/Codex OAuth — and there are no provider CLIs; a new provider is a pi-runtime + config-mapping concern, not a Rust adapter. **Gemini is dropped.** Third-party tool integrations (Gmail/Calendar/etc.) are NOT providers — they go through the `IntegrationProvider` port (`packages/host/src/integrations/`, Composio first).

New AI provider (legacy Rust path) = one new adapter file in `engine/houston-terminal-manager/src/provider/<name>.rs` implementing `ProviderAdapter`, one entry in `REGISTRY`, three dispatch arms (runner spawn in `session_dispatch.rs`, NDJSON parser in `session_io.rs`, title summarizer in `sessions/summarize.rs`). All other call sites pick the new provider up automatically through `Provider::from_str` and the registry. `Provider` is a `Copy` newtype around `&'static dyn ProviderAdapter`, NOT an enum, so no variant additions are needed.

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
- Pre-commit: `pnpm tsgo --noEmit` AND `pnpm check-locales` (catches missing keys, shape drift, placeholder parity, em dashes).
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

Branch model:
- `main` — releasable, protected, PRs only
- `claude/<worktree-name>` — the worktree's own branch (auto-created on worktree spawn); commits go here

End-to-end flow (run without asking, unless a step is destructive and not pre-authorized):
1. `git branch --show-current` → confirm it's the worktree branch (e.g. `claude/crazy-pare-b3d43d`). Never switch to `claude/wip` or `main`.
2. Stage specific files. Never `git add -A`.
3. Conventional commit (`feat:` `fix:` `docs:` `chore:` `refactor:` `style:` `test:`).
4. `git push -u origin <worktree-branch>`.
5. `gh pr create --base main --title "…" --body "…"` — summarise changes, list affected files.
6. Merge the PR yourself: `gh pr merge --squash --delete-branch`. User does NOT review — they rely on the phase protocol + tests + typecheck to catch issues before commit.
7. Cleanup (from the main repo checkout, not the worktree): `git worktree remove <path>` is handled by the harness on exit; just ensure the remote branch is deleted by `--delete-branch`.

Never `git reset --hard` on `main`, never force-push to `main`, never merge without the PR step (even for trivial changes — PR is the audit trail).

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
