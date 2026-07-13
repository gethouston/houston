# Houston — repo knowledge

**The session protocol (writing style, Rule 0, work phases, git/PR workflow) lives at the workspace level: `~/dev-houston/CLAUDE.md`** (symlinked into every task workspace). This file is houston-specific knowledge only.

---

## System at a glance (read once at session start)

> **Houston runs on ONE engine: the TypeScript host.** The legacy Rust `engine/` (and the `app/houston-tauri` glue crate) were deleted in the final cutover (`convergence/final-cutover.md`). Older `knowledge-base/` notes may still mention the Rust engine — treat any such mention as historical.

**One engine, one host.** The engine is the **pi runtime** (`packages/runtime`, the only agent loop) behind a **host** (`packages/host`, `@houston/host`): one deployment-agnostic server serving **both desktop and cloud** from the same code. The multi-tenant CLOSED control plane (`@houston/host-cloud`: Pg/Gcs/Gke/Redis adapters + operator-admin + cloud `main.ts`) was **RETIRED and deleted** — the shipped cloud is a private gateway + one engine pod per agent running this repo's open host/runtime; the boundary rules that keep this repo cloud-lib-free are documented in `BOUNDARY.md` and machine-enforced by `scripts/check-boundaries.mjs` (`pnpm check:boundaries`). Domain logic lives once in `packages/domain`; wire types in `packages/protocol` (**protocol v3**). On the desktop the Tauri shell (`app/src-tauri`) spawns the Bun-compiled host as a sidecar (staged at `binaries/houston-engine-<triple>` — the name is deliberately kept; `scripts/build-host-sidecar.sh` bun-compiles it).

**No provider CLIs.** pi talks to providers in-process (Anthropic + OpenAI/Codex OAuth, plus API-key providers such as OpenCode, OpenRouter, Google Gemini, and Amazon Bedrock). The old bundled CLIs (claude-code, codex, gemini) and the per-arch Composio CLI are gone, along with the whole CLI-bundling pipeline (`cli-deps.json`, `scripts/fetch-cli-deps.sh` — deleted). **Gemini CLI is dropped; Google Gemini remains as an API-key pi provider.** **Composio is KEPT but RE-WIRED** — an in-process REST tool behind an `IntegrationProvider` port (`packages/host/src/integrations/`), **platform mode**: Houston's ONE project key (env `COMPOSIO_API_KEY`, cloud/self-host only — the desktop forwards through Houston's cloud gateway with the user's GCIP (Firebase) session, never holding a key), users are plain `user_id`s who only OAuth the apps themselves, **no CLI, no per-user Composio account**. **Also removed:** mobile/tunnel/relay (`mobile/` + `houston-relay/`), the custom-frontend reference (`examples/smartbooks/`), the legacy Rust-engine VPS image (`always-on/`), worktrees, store/marketplace, claude-CLI install. Single personal workspace on desktop/self-host; multiplayer Teams (orgs/roles/sharing) SHIPPED in the paid hosted cloud — gateway-enforced, capability-gated client surface (`knowledge-base/teams.md`), fully testable locally via `pnpm dev`'s web pane (`knowledge-base/dev-loop.md`).

The pieces:
- **`app/`** — Tauri 2 desktop. `app/src` is the shared React frontend (also runs verbatim as `packages/web`). `app/src-tauri` is the Rust shell that spawns the Bun-compiled host as its sidecar (staged at `binaries/houston-engine-<triple>`) and talks HTTP + SSE. OS-native glue only — no domain logic.
- **`packages/runtime`** — the **pi engine** (TS/Node in dev/test/Docker; Bun only inside the compiled desktop sidecar). Single-workspace, single-credential, tenancy-free. The ONLY agent loop.
- **`packages/host`** — the **host** (cloud control plane AND local desktop supervisor: the SAME server, different adapter profiles). Serves protocol v3. OPEN package.
- **`@houston/host-cloud`** *(RETIRED, deleted)* — the multi-tenant CLOSED control plane (Pg/Gcs/Gke/Redis adapters + operator-admin + cloud `main.ts`) was an architecture the shipped cloud moved past (gateway + per-agent engine pods won); it survives only in git history. The boundary rules stay load-bearing: open code never imports a cloud lib or `@houston/host-cloud`, and `packages/host-cloud` may never reappear — `BOUNDARY.md` + `scripts/check-boundaries.mjs` (`pnpm check:boundaries`, wired into the PR CI gate `.github/workflows/ci.yml`).
- **`packages/domain` / `packages/protocol`** — shared domain logic (`.houston` layout, schemas, cron, portable) + v3 wire types/zod.
- **`ui/`** — `@houston-ai/*` React packages. Props-only, no store imports. `@houston-ai/engine-client` is the TS front door; desktop (`app/`) and web (`packages/web`) both alias it to the v3 host adapter (`packages/web/src/engine-adapter/`).
- **User data** — `~/.houston/`: `workspaces/<Workspace>/<Agent>/`, each agent with `.houston/` data files + `CLAUDE.md` + `.agents/skills/`. The layout is native to the host (chat history from Rust-era installs is migrated once, on the host's boot).
- **Wire contract** — every domain call is a `fetch`/SSE in `@houston-ai/engine-client` (v3 against the host). No `invoke(...)` Tauri commands for domain.
- **Reactivity** — the host emits `HoustonEvent`s on a global channel (`/v1/events` SSE); TanStack Query invalidation in `app/src/hooks/use-agent-invalidation.ts` maps events → query keys. FS watcher catches direct agent writes.
- **Voice** — agents' target user is NON-technical; the product prompt forbids mentioning files/JSON/configs/CLIs. The desktop shell builds it in `app/src-tauri/src/houston_prompt/` and hands it to the host at spawn (`HOUSTON_APP_SYSTEM_PROMPT`); the host's own copy is `packages/host/src/houston-prompt.ts`. The engine is prompt-agnostic.

Before touching anything: run PHASE 1 (load `knowledge-base/architecture.md` + any KBs relevant to scope). Older `knowledge-base/` engine/CLI notes describe the removed Rust engine — treat as historical unless they say otherwise.

## Dispatch table (progressive discovery)

Running the app in development? **`pnpm dev` is the ONLY entry point** (doctor + six mprocs panes; full multiplayer locally, no Kubernetes) → `knowledge-base/dev-loop.md`
Deploying / shipping a release? → `/release`
Manual macOS build, notarize, staple? → `/build-app-local`
Bug? Don't guess → `/debug`

Need specific knowledge? Load on demand:
- **Host architecture (host + pi runtime + adapter profiles, protocol v3, Composio-as-REST) → `knowledge-base/architecture.md`.** `convergence/` is the record of how we got here (the Rust→host cutover) — historical, not the day-to-day map.
- Colors, typography, components, animation → `knowledge-base/design-system.md`
- Client architecture — SDK / tokens / inventory / parity procedures → `knowledge-base/client-architecture.md`
- `.houston/` layout, schemas, reactivity → `knowledge-base/files-first.md`
- Skills on disk + UI, picker, invocation marker → `knowledge-base/skills.md`
- Integrations (Composio platform mode — provider port, direct vs gateway adapter, sandbox path, grants model incl. local single-player grants, UI map; PLUS custom integrations, HOU-550: the embedded executor engine, `custom` provider, secure credential card, agent setup tools) → `knowledge-base/integrations.md`
- Agent manifest, tiers, sidebar, workspaces → `knowledge-base/agent-manifest.md`
- Agent Store (public catalog, publish/install, agents.gethouston.ai) → `knowledge-base/agent-store.md`
- Multiplayer Teams (orgs) client surface — roles owner/admin/user + per-agent access manager/user, role matrix v2 (`app/src/lib/org-roles.ts`), org dashboard, Share dialog, allowed-models ceiling + per-user model choice, integration allowlists; **plus C8 Spaces** (personal + team spaces, the `org:<slug>` workspace switcher / `x-houston-org` active-space pin, create-team, share-via-team pipeline, seat billing + trial + degrade states, `capabilities.spaces` + per-space role); the gateway is the sole enforcer → `knowledge-base/teams.md` (server contracts: `cloud/docs/contracts/C3`,`C4`,`C7-teams.md`,`C8-spaces-billing.md`)
- v3 wire protocol (REST + SSE) → `packages/protocol/` (types + zod). The host is `packages/host` (run: `pnpm --filter @houston/host dev`).
- Provider error taxonomy → `knowledge-base/provider-errors.md` (the shared taxonomy the host/pi providers map to; the old Rust classifier is gone).
- Integrations: Composio is an in-process REST tool behind the `IntegrationProvider` port (`packages/host/src/integrations/`) — no bundled CLI, pi has no provider CLIs.
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

## Houston-specific phase notes

The phases themselves are in the workspace CLAUDE.md. In this repo they mean:

- Phase 1 (context): read `knowledge-base/architecture.md` + KBs relevant to scope. Name what you loaded.
- Phase 3 (challenge): library or app? Generic → ui/engine. App-specific → app/. Props generic, no store imports, no app types?
- Phase 4 (plan): tag each step `[ui/board]`, `[host]`, `[app]`. Library before app.
- Phase 6 (test): host/runtime/domain → vitest; the Tauri shell (`app/src-tauri`) → `cargo test`, not just check.
- Phase 7 (verify): UI touched → visual fidelity check. Issue? Add logging first (`/debug`), never blind fix.
- Phase 9 (cleanup): ui/ → no `@/`, no Zustand, no Tauri. app/ → no duplicated logic.
- Phase 10 (document): `knowledge-base/*.md`, skills, showcase.

---

## Test commands

| Area | TS | Rust | Full build |
|------|----|------|------------|
| ui/ | `pnpm typecheck` | — | — |
| host / runtime / domain | `pnpm --filter @houston/host --filter @houston/runtime --filter @houston/domain test` (vitest) | — | `scripts/build-host-sidecar.sh <triple>` (bun-compile the desktop sidecar) |
| boundaries | `pnpm check:boundaries` | — | — |
| app/ | `cd app && pnpm tsgo --noEmit` | `cd app/src-tauri && cargo check` (the Tauri shell) | `cd app && pnpm tauri build` |
| app/ Win MSI | — | — | `cd app && pnpm tauri build --target x86_64-pc-windows-msvc` (needs Windows host or `xwin` SDK) |
| app/ i18n | `cd app && pnpm check-locales` | — | — |
| packages/web | `pnpm --filter houston-web typecheck` (runs Tauri shim-parity guard + tsgo) | — | `pnpm --filter houston-web build` |
| packages/web UI tests | `pnpm --filter houston-web test:e2e` (Playwright; `typecheck:e2e` for the harness) — see `knowledge-base/ui-testing.md` | — | — |

### Host sidecar staleness

The dev loop (`pnpm dev` — doctor + mprocs, THE single entry point; `knowledge-base/dev-loop.md`) points the app at an **externally-run** host (`VITE_NEW_ENGINE_URL=http://127.0.0.1:4318`, the `host` pane), so the Tauri shell does NOT spawn the bundled sidecar — host changes are picked up by restarting that pane. A packaged build (or a `pnpm tauri dev` with no host URL) spawns the staged `binaries/houston-engine-<triple>`, which `build.rs` stages from `target/host-sidecar/houston-host-<triple>`: run `scripts/build-host-sidecar.sh <triple>` first, else `build.rs` stages a no-op placeholder (the dev loop never runs it).

**Release builds are guarded (fail-closed).** A stale sidecar left from a previous commit once shipped: packaged v0.5.2 bundled a host predating the `/v1/catalog` route, so the app showed its provider seed with zero models. Two guards now prevent this. `scripts/build-host-sidecar.sh` writes a `<binary>.stamp` recording the git HEAD it compiled at, and its `--verify` step asserts `/v1/catalog` returns a non-empty JSON array. On a RELEASE build `build.rs` reads that stamp and panics if any of the sidecar's input paths (`packages/{host,runtime,runtime-client,domain,protocol}`, `ui/agent-schemas`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `scripts/build-host-sidecar.sh`) changed since the stamp commit — committed, staged, unstaged, or untracked. Unrelated docs-only or frontend-only commits do NOT force a rebuild. Debug builds skip the stamp check.

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

### Client-surface changes
Three surfaces (web/desktop today; iOS/Android next), one model of the world. Three iron rules:
- **Behavior** (turn lifecycle, state, reconnection, VM fields) → change `@houston/sdk` FIRST, then surfaces bind. NEVER re-implement behavior in surface code. VM-snapshot changes are contract changes — additive only.
- **Visual values** → a design-token edit (`packages/design-tokens`), never a hardcoded hex/spacing literal in app or `ui/`.
- **Cross-surface structure** (a component added/changed) → bump `design/inventory/inventory.yaml` + CHANGELOG + enforced manifests in the SAME PR (`pnpm check:parity`).

Full procedures + decision table + verification matrix: `knowledge-base/client-architecture.md`.

### Host / shell boundary
- `packages/host` + `packages/runtime` + `packages/domain` = frontend-agnostic. No Tauri. No React. No webview assumption.
- Tauri-specific glue → `app/src-tauri` (the shell: spawns the host sidecar, OS-native commands, tray, auth storage). No domain logic there.

### Adding a provider

Providers are **in-process** in the pi runtime — Anthropic + OpenAI/Codex OAuth plus API-key providers such as OpenCode, OpenRouter, Google Gemini, and Amazon Bedrock. There are no provider CLIs; a new provider is a pi-runtime + config-mapping concern (`packages/runtime/src/ai/providers.ts`, the host catalog `packages/host/src/providers.ts`, the protocol `ProviderId`, and the frontend catalog/logo). **Gemini CLI is dropped, not the API-key provider.** Third-party tool integrations (Gmail/Calendar/etc.) are NOT providers — they go through the `IntegrationProvider` port (`packages/host/src/integrations/`, Composio first).

**Error classification**: providers map their failure patterns to the shared `ProviderError` taxonomy (`RateLimited`, `QuotaExhausted`, `Unauthenticated`, ...) in the runtime/host; the frontend already renders every variant (`app/src/components/shell/provider-error-card.tsx`) — no UI work unless you need a custom status-page URL or a provider-specific reconnect flow.

See `knowledge-base/agent-manifest.md` (provider/model table) and `knowledge-base/provider-errors.md` (taxonomy) for the full picture.

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
- **User data = different.** Canonical location is `~/.houston/**` (workspaces live at `~/.houston/workspaces/`). Shape/layout changes inside `~/.houston/<agent>/.houston/**` need an **idempotent migration** on the host's boot path (`packages/host/src/migrate/` — agent-layout for the flat→per-type layout, chat-history for the Rust-era db; add new ones beside them and call them from `packages/host/src/local/host.ts` `start()`). Never break existing users.
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

## Git

Workflow lives in the workspace CLAUDE.md (task branches `agent/<task-id>/<repo>`, per-repo PRs against `main`, never merge without explicit instruction). Houston-specific: `main` is protected, PRs only. Never `git reset --hard` or force-push on `main`.

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
