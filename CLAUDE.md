# Houston

Houston is ONE TypeScript engine — the **pi runtime** (`packages/runtime`, the only agent loop) behind the **host** (`packages/host`) — serving desktop and cloud from the same code, with one shared client behavior layer (`@houston/sdk`) bound by every surface. **The code is the truth**: there is no separate knowledge base. Read the module and its tests before changing it; this file holds only the non-obvious map and the rules.

## Repo map

| Path | What it is |
|------|------------|
| `app/src` | Shared React frontend. Runs verbatim as `packages/web` |
| `app/src-tauri` | Tauri 2 shell: spawns the Bun-compiled host sidecar (`binaries/houston-engine-<triple>`). OS-native glue only, no domain logic |
| `packages/runtime` | The pi engine. Single-workspace, tenancy-free. Providers are in-process (`src/ai/providers.ts`) — no provider CLIs |
| `packages/host` | The host server (protocol v3). Same server for desktop and cloud, different adapter profiles. Boot migrations: `src/migrate/` |
| `packages/domain` / `packages/protocol` | Domain logic (`.houston` layout, schemas, cron, portable) / v3 wire types + zod |
| `packages/sdk` | Client behavior layer (turn lifecycle, conversation VM). Every surface binds it |
| `packages/web` | Web build of `app/src` + Playwright e2e/visual suites (see `packages/web/e2e/README.md`) |
| `ui/` | `@houston-ai/*` React packages, props-only. `@houston-ai/engine-client` is the TS front door |
| `packages/design-tokens` | Visual values. Tokens win over any hardcoded literal |
| `mobile/ios` | Native SwiftUI app over `@houston/sdk`. Parity notes: `mobile/PARITY*.md` |
| `agentstore/` | Agent Store frontend (agents.gethouston.ai) |
| `selfhost/` | Docker + Caddy self-host image (`selfhost/README.md`) |
| `skills/` | Task procedures: `/release`, `/debug`, `/build-app-local`, `/design-review`, `/frontend-design` |
| `docs/adr/` | Architecture decision records |
| `convergence/`, `store/` | Historical: the Rust→TS cutover record; legacy bundled catalog data. Never the current map |

Non-obvious wiring:

- Every domain call is a `fetch`/SSE through `@houston-ai/engine-client` against the host. Never a Tauri `invoke(...)` for domain.
- The host emits `HoustonEvent`s on `/v1/events` (SSE); `app/src/hooks/use-agent-invalidation.ts` maps events to TanStack Query keys. An FS watcher catches direct agent file writes.
- User data lives at `~/.houston/workspaces/<Workspace>/<Agent>/` (`.houston/` data + `CLAUDE.md` + `.agents/skills/`).
- The retired multi-tenant control plane (`@houston/host-cloud`) must never reappear, and open code never imports a cloud lib. Rules: `BOUNDARY.md`, enforced by `pnpm check:boundaries` (in CI).
- Composio runs in platform mode behind the `IntegrationProvider` port (`packages/host/src/integrations/`): one project key (`COMPOSIO_API_KEY`, cloud/self-host only), users are plain `user_id`s. No CLI, no per-user Composio account.
- Agents speak to a NON-technical user: the product prompt (`packages/host/src/houston-prompt.ts`; desktop copy built in `app/src-tauri/src/houston_prompt/`) forbids mentioning files/JSON/configs/CLIs. The engine itself is prompt-agnostic.
- Capability gating (`/v1/capabilities`) is the server describing the deployment, NOT a feature flag. Keep it.
- Domain vocabulary (Conversation VM, echo, send policy, autocompact, board status…) is defined in `CONTEXT.md`. Use those terms; ADRs live in `docs/adr/`.

## Dev loop

`pnpm dev` is the ONLY entry point (doctor + mprocs panes; full multiplayer locally, no Kubernetes). Never start vite/host/tauri panes by hand. The dev app points at the externally-run host pane (`VITE_NEW_ENGINE_URL=http://127.0.0.1:4318`) — restart that pane to pick up host changes.

## Commands

| Area | Check / test |
|------|--------------|
| Any TS/JS/JSON change | `pnpm check:fix` after EVERY change; end state `pnpm check` exits 0 (Biome) |
| ui/ | `pnpm typecheck` |
| host / runtime / domain | `pnpm --filter @houston/host --filter @houston/runtime --filter @houston/domain test` (vitest) |
| boundaries | `pnpm check:boundaries` |
| app/ types | `cd app && pnpm tsgo --noEmit` |
| app/ unit tests | `cd app && pnpm test` (run whenever `app/src` logic or `app/tests` change) |
| app/ i18n | `cd app && pnpm check-locales` |
| Tauri shell | `cd app/src-tauri && cargo check`; features need `cargo test` |
| packages/web | `pnpm --filter houston-web typecheck` (includes Tauri shim-parity guard) |
| packages/web e2e | `pnpm --filter houston-web test:e2e` (Playwright; `typecheck:e2e` for the harness) |
| packages/web visual | `pnpm --filter houston-web test:visual`; re-record intentionally via `test:visual:update` |
| Cross-surface parity | `pnpm check:parity` |
| Desktop sidecar build | `scripts/build-host-sidecar.sh <triple>` |

### Host sidecar staleness

A packaged build (or `pnpm tauri dev` with no host URL) spawns the staged sidecar, which `build.rs` stages from `target/host-sidecar/houston-host-<triple>` — run `scripts/build-host-sidecar.sh <triple>` first or you get a no-op placeholder. Release builds fail closed: the script writes a `<binary>.stamp` at the git HEAD it compiled, its `--verify` step asserts `/v1/catalog` returns a non-empty array, and on RELEASE builds `build.rs` panics if any sidecar input path changed since the stamp commit. Debug builds skip the stamp check.

## Hard rules

### Features default ON — no dark switches
1. Needs nothing external → no switch exists. Merging = releasing; not ready = not merged (short branches, never long-lived flags or `X_ENABLED` booleans).
2. Needs a credential → the credential IS the switch. Key present = on; key absent = loud, named OFF with the remedy. Never layer a boolean on top.
3. Deliberately off (e.g. analytics in dev) → a committed `.env.development` line with a reason. Personal toggles → `.env.local`, never CLI flags.

### Error surfacing: silent to the user, never silent to us
- An unexpected error shows the user NOTHING, but MUST reach every reporting path — frontend log, PostHog `app_error_shown`, Sentry. Route it through `showErrorToast` (report-only despite its name) or `reportError`/`logAndReportError` (`app/src/lib/{error-toast,error-report}.ts`); never a bare `console.error`, never an empty catch.
- Toasts are reserved for states the user can act on, with authored `t()` copy — never a raw `err.message` or a generic red box: expected business states (`showExpectedStateToast`), device offline / host unreachable (`showConnectivityErrorToast`), engine pod waking (`showEngineWakingToast`), plus call-site copy like "name already taken". Connectivity and pod-waking states skip Sentry: nothing in Houston broke.
- Banned swallowing, both languages: TS `.catch(() => null/[]/{})`, catch-without-report, log-only catches, fire-and-forget promises in handlers; Rust `let _ =`/`.ok()`/`unwrap_or*` on user-initiated ops, log-and-continue `Err(_)` arms, `unwrap()`/`expect()` outside tests. The one Rust exception: `tracing::error!` from emit/watcher callbacks with no UI thread. When unsure, report — don't swallow.

### Library boundary (ui/)
- Generic reusable → `ui/`. App-specific → `app/`. Unsure → start in `app/`, extract later.
- Props over stores, always: no Zustand/Redux imports, no `app/` types, no `@/` aliases, no `react-i18next` in `ui/`. Use generic types (`BoardItem`, `FeedItem`, `ChatMessage`).

### Client-surface changes (SDK first)
- Behavior (turn lifecycle, state, reconnection, VM fields) → change `@houston/sdk` FIRST, surfaces bind. Never re-implement behavior in surface code. VM-snapshot changes are additive only.
- Visual values → edit `packages/design-tokens`, never a hardcoded hex/spacing literal.
- Cross-surface structure (component added/changed) → bump `design/inventory/inventory.yaml` + CHANGELOG + manifests in the SAME PR (`pnpm check:parity`; procedures in `design/inventory/README.md`).
- Visual-value changes to key screens → re-record Playwright visual baselines (`test:visual:update`, both `darwin` + `linux` sets) in the SAME PR.

### Host / shell boundary
`packages/{host,runtime,domain}` are frontend-agnostic: no Tauri, no React, no webview assumption. Tauri glue lives in `app/src-tauri` with no domain logic. Windows rule for the shell crate: use `dirs::home_dir()`, never `HOME`.

### Adding a provider
A new provider is in-process: `packages/runtime/src/ai/providers.ts` + host catalog `packages/host/src/providers.ts` + protocol `ProviderId` + frontend catalog/logo. Never a CLI. Map failures to the shared `ProviderError` taxonomy (`packages/protocol`); the frontend already renders every variant (`app/src/components/shell/provider-error-card.tsx`). Third-party tool integrations (Gmail etc.) are NOT providers — they go through the `IntegrationProvider` port.

### AI-native reactivity
Users and agents are equal writers; every `.houston/` surface must react to file changes regardless of author. All `.houston/` reads → TanStack Query + event invalidation, never load-on-mount-only. Never ship "agent can do X but UI won't show it until refresh".

### Internationalization
- Ships en / es / pt. Every user-facing string goes through `t()` — no literal English in JSX text, props, placeholders, aria-labels, toasts, errors.
- Namespaces: `app/src/locales/<lang>/<ns>.json`, registered in `app/src/lib/i18n.ts`, typed via `app/src/types/react-i18next.d.ts` (typos fail compile). en is source of truth; es/pt mirror it.
- `ui/` stays i18n-agnostic: components take flat-string `labels?` props with English defaults; `app/` passes `t()` results.
- Variables via `t("key", { name })`, plurals via `count` + `_one`/`_other`, markup via `<Trans>`. Never string concat.
- No em dashes in user copy (validator enforces). Spanish = LatAm neutral (tú); Portuguese = Brazilian (você).
- Pre-commit: `pnpm tsgo --noEmit` AND `pnpm check-locales`.

### Data compatibility
- Internal code (types, APIs, functions): change = change, no backwards-compat keeps.
- User data under `~/.houston/**` is different: shape/layout changes need an idempotent boot migration in `packages/host/src/migrate/`, called from `packages/host/src/local/host.ts` `start()`. Never break existing users. Legacy `~/Documents/Houston/**` is NOT auto-migrated.

### Always
- Tests mandatory for every feature (tests don't count toward the line limit).
- Read files in full before wide-ranging changes; don't edit from search snippets.
- No `any`. Domain concepts are enums / discriminated unions, never bare strings.
- Comments state non-obvious constraints and surprising behavior, never narrate control flow.
- No hover-only affordances: interactive elements visible without hovering.
- 200 lines/file max (CSS 500). Never compress to fit — extract modules.
- Search before building: shadcn/ui registry, `@houston-ai` showcase, existing components, npm.
- Debugging: never guess — read logs first (`/debug`).
- Be critical, not agreeable: if a better approach exists, say so.

## UI / design work

Read `/DESIGN.md` FIRST and hold it in context (tokens, motion, hard rules, banned defaults). Token values: `packages/design-tokens/tokens/*.json` — the JSON wins any conflict. Design judgment is Julian's alone: show him, never self-review the look. No `/design-review` screenshot loops; `/frontend-design` variants only if he asks.

## Git, secrets, permissions

- `main` is protected: PRs only, never `git reset --hard` or force-push on `main`. Never merge without explicit instruction.
- Branches: `fix|feat/<issue-id>-<short-slug>` (no personal handles). Commits and PR titles: conventional `type(scope): summary` — types `feat|fix|docs|chore|refactor|test`; scopes are areas like `host`, `shell`, `chat`.
- Secrets (signing identities, API keys, issuer UUIDs): env vars only — `option_env!()` in Rust, env in CI. Never literals in committed files.
- Confirm before destructive ops, hard-to-reverse actions (force-push, dep removal), shared-state changes (push, PR create, Slack/email), and third-party uploads. One approval ≠ approval in all contexts.
