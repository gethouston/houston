# Architecture

> **⚠️ READ FIRST — single-engine convergence.** Much of this doc below describes the **legacy Rust `engine/`** and the original 7-products layout. Houston has converged onto ONE TypeScript engine for desktop AND cloud; the new architecture is the source of truth in **`convergence/README.md`**. The Rust `engine/` is still the *current default* desktop build (rollback oracle), **deleted at P6**. Treat the Rust-crate sections below as legacy-but-shipping.

## Current architecture (the convergence target)

ONE deployment-agnostic server — the **host** (`packages/host`) — with ONE router, ONE `authorize()` seam, ONE domain layer, and **two adapter profiles** (local desktop vs cloud multi-tenant) wired in `main()`. The only agent loop is the **pi runtime** (`packages/runtime`, TS/Bun) — single-workspace, single-credential, tenancy-free. Domain logic lives once in `packages/domain`; wire types + zod in `packages/protocol` (**protocol v3**). The frontend (`app/src`, also `packages/web`) talks ONLY to the host via `@houston-ai/engine-client`, every deployment.

- **Desktop** = the host booted with local adapters (FS store/vfs, subprocess pi launcher, single-user identity, FS watcher → events), spawned by the Tauri shell as a Bun-compiled sidecar (`--features host-sidecar`).
- **Cloud** = the same host with cloud adapters (Postgres, GCS, GKE/Cloud-Run launcher, Supabase identity, Redis bus). Per-turn Cloud Run: hydrate → run one pi turn → sync → wipe. Those cloud adapters + operator-admin + the cloud `main.ts` live in the CLOSED `packages/host-cloud` (`@houston/host-cloud`), extracted from the open host.
- **Open/closed seam** = the open local stack (`protocol`/`domain`/`runtime`/`ui`/`host` + local adapters + `app`) may never import a cloud adapter; inside the host only `main.ts`/`admin/**` touch a concrete cloud adapter, everything else goes through ports. Documented in `BOUNDARY.md` (repo root), machine-enforced by `scripts/check-boundaries.mjs` (`pnpm check:boundaries`, wired into the PR CI gate).
- **Self-host** = the local host in Docker behind Caddy TLS (`selfhost/`).
- **Providers** are in-process in pi: Anthropic + OpenAI/Codex + GitHub Copilot OAuth, plus API-key providers OpenCode Zen/Go, OpenRouter, DeepSeek, Google Gemini, Amazon Bedrock, and MiniMax global (`minimax`, not `minimax-cn`). **No provider CLIs.** Bedrock uses pi-ai's native `amazon-bedrock` provider; Houston maps the stored key to Bedrock's `bearerToken` request option in `packages/runtime/src/ai/bedrock.ts`.
- **Composio** (and future integrations) = an in-process REST tool behind the `IntegrationProvider` port (`packages/host/src/integrations/`), each user's own free account, no CLI.
- **Drift prevention** = port contract suites + the dual-profile parity test (`packages/host/src/dual-profile.test.ts`) + `/v1/capabilities` (no "am I web/desktop" branches). Gate spec: `convergence/parity-checklist.md`. PR CI gate: `.github/workflows/ci.yml`.
- **Removed (deleted, not just planned):** `mobile/` + `houston-relay/` (mobile PWA + tunnel), `examples/smartbooks/` (custom-frontend reference), `always-on/` (the legacy Rust-engine VPS image — superseded by `selfhost/`), worktrees, store/marketplace, claude-CLI install. Single personal workspace (teams later).

Everything from here down is the legacy/transitional detail (Rust engine crates, bundled CLIs, the original product map). Accurate for the default build until P6, but `convergence/README.md` is canonical for the direction.

---

Houston = open platform. Organized as **7 products + 3 code libraries**.

## The 7 products (end-user)

| Product | Dir | What |
|---------|-----|------|
| Houston App | `app/` | Desktop app (Tauri 2). Non-technical users create agents, run parallel terminal sessions. |
| Houston Web | `packages/web/` | The **full** desktop UI running in a plain browser tab. Composes `app/src` verbatim; `@tauri-apps/*` aliased to browser shims. Two modes: connect to any remote `houston-engine` (URL+token), or **cloud mode** (`VITE_CONTROL_PLANE_URL`) — Supabase sign-in via the app's NATIVE auth (same `SignInScreen`/sidebar `UserMenu` as desktop), agents served by the control plane. No fork, no `app/` changes. See `packages/web/README.md`. |
| Houston Mobile | ~~`mobile/`~~ **REMOVED** | Was a React PWA served from `tunnel.gethouston.ai` over the relay. The mobile/tunnel feature was cut in the convergence; `mobile/` + `houston-relay/` are deleted. |
| Houston Store | `store/` | Release-bundled registry of pre-built Houston agents. One-click install. |
| Houston Website | `website/` | gethouston.ai landing. |
| Houston Always On | ~~`always-on/`~~ **REMOVED** | Was a one-click VPS/microVM deploy of the Rust engine. Superseded by `selfhost/` (the TS host in Docker behind Caddy); `always-on/` is deleted. |
| Houston Teams | `teams/` | Hosted multi-tenant agent pool w/ perms. **TBD.** |

## The 3 code libraries

| Library | Dir | What | Consumers |
|---------|-----|------|-----------|
| Houston UI | `ui/` | `@houston-ai/*` React components | App, Mobile, future hosted products' frontends |
| Houston Engine | `engine/` | Rust crates. **Frontend-agnostic backend.** Open source. Anyone self-hosts or uses as desktop-app backend. | App (via `app/houston-tauri` adapter), Always On, Teams, Cloud customers |
| Houston Cloud | `cloud/` + `packages/{host,host-cloud,runtime,code-sandbox,web}` | **LIVE (beta).** Hosted multi-tenant agents on GCP: agent = a DB row + a GCS prefix; a turn = ONE Cloud Run request (hydrate → run pi → sync → wipe, scale-to-zero); untrusted code runs in a separate egress-locked Cloud Run microVM sandbox. Credentials = connect-once user subscriptions (OpenAI/Codex), served access-token-only. Workspaces carry a `runtime` flag (`cloudrun` default; `gke` legacy pods until PVC→GCS migration). Start at `cloud/code-execution.md` + `cloud/README.md`. | Houston Web (cloud mode) users |

## Key distinction: Engine is standalone

**Houston Engine is the reusable backend.** Devs run it themselves (open source) or rent it via Cloud. Devs put ANY frontend on top — Houston App is just ONE consumer.

- Engine stays pure Rust, no Tauri, no React, no webview assumption
- `app/houston-tauri/` is the **adapter** that applies Engine to the Tauri desktop frontend. Lives under `app/`, not `engine/`.
- Future Always On + Teams consume Engine over network (HTTP/WS — **not yet built**)

## Infra dirs (not products)

| Dir | What |
|-----|------|
| ~~`houston-relay/`~~ **REMOVED** | Was the Cloudflare Worker + Durable Object at `tunnel.gethouston.ai` (reverse-tunnel proxy + static host for the mobile PWA). Deleted with the mobile/tunnel cut. |
| ~~`examples/smartbooks/`~~ **REMOVED** | Was the reference custom-frontend consumer of `houston-engine` (own brand, zero `@houston-ai/*` UI deps). Deleted in the convergence sweep. |
| `knowledge-base/` | These caveman docs. Loaded on demand. |
| `scripts/` | Version bump, release, CLI binary fetch. |

## Engine crates (`engine/`)

15 crates. All pure libraries. No frontend assumptions. Full list in
the workspace root `Cargo.toml`.

- `houston-db` — libSQL. `chat_feed`, `preferences`, `engine_tokens` tables.
- `houston-terminal-manager` — Claude/Codex/Gemini subprocess manager, parser, streaming. Houses the `ProviderAdapter` trait + static `REGISTRY` under `src/provider/{anthropic,openai,gemini}.rs`. `Provider` is a `Copy` newtype around `&'static dyn ProviderAdapter`; new providers register one adapter file + one entry in the registry. Three narrow dispatch sites by `provider.id()` remain (runner spawn, NDJSON parser, title summarizer); everything else picks the new provider up automatically through `Provider::from_str`. Failure handling flows through the typed `ProviderError` enum (`provider_error_kind.rs`) — every adapter classifies its stderr / result-error patterns into shared variants (`RateLimited`, `QuotaExhausted`, `Unauthenticated`, ...) that the frontend renders with variant-specific cards. See `knowledge-base/provider-errors.md` for the full taxonomy + classifier contract.
- `houston-events` — hook/webhook/lifecycle queue
- `houston-scheduler` — cron + heartbeat
- `houston-agent-files` — `.houston/` file I/O, schemas, migration
- `houston-agents-conversations` — chat feed persistence
- `houston-ui-events` — typed event bus + `EventSink` trait (Tauri/broadcast impls, frontend-neutral)
- `houston-file-watcher` — `notify` on `.houston/`, emits events
- `houston-composio` — Composio CLI lifecycle (bundle-aware: skips install when shipped inside the .app)
- `houston-cli-bundle` — resolve bundled CLI binaries (codex universal, composio per-arch) inside the `.app`/MSI; reads pinned `cli-deps.json` manifest
- `houston-claude-installer` — runtime download of Claude Code CLI (proprietary license, can't bundle); pinned URL + sha256 verification, atomic install, progress events
- `houston-tunnel` — outbound reverse tunnel client; desktop engine dials the relay so mobile can reach it through NAT. Heartbeat + watchdog; tunnel identity stays stable across normal network failures and only re-allocates on relay auth rejection.
- `houston-skills` — skill discovery + management
- `houston-agent-portable` — `.houstonagent` package format (zip writer/reader, manifest schema, selection model). See `knowledge-base/portable-agents.md`.
- `houston-engine-core` — runtime container (`EngineState`, paths, `workspaces::*`, `agents::{activity,routines,routine_runs,config,conversations,files,prompt,self_improvement}`, `sessions::{history,provider,summarize}`, `routines::{runner,runs,scheduler,engine_dispatcher}`, `store`, `sync`, `worktree`, `provider`, `attachments`, `preferences`, `conversations`, `skills`, `agent_configs`). Domain logic relocated from the Tauri adapter.
- `houston-engine-protocol` — wire types (REST DTOs, WS envelope, error codes, `PROTOCOL_VERSION`). Matches `ui/engine-client/src/types.ts`.
- `houston-engine-server` — axum HTTP+WS binary `houston-engine`. The process every client talks to. Full REST surface live — 17 route modules covering workspaces, agents CRUD, sessions, agent data + files, routines + scheduler, skills, store, composio, claude (runtime install), tunnel + pairing, worktrees, shell, attachments, preferences, providers, agent-configs, conversations, watcher. See `knowledge-base/engine-protocol.md` for the complete table.

**Bundled provider CLIs:** Houston ships the codex CLI (Apache-2.0),
composio CLI (MIT), and gemini CLI (Apache-2.0, macOS-only in v1)
inside the signed/notarized `.app` so non-technical users get them
preinstalled. The proprietary Claude Code CLI is downloaded on first
launch with sha256 verification. Gemini on Windows is a phase-2
fork-build (no upstream Windows artifact). Resolution + install flow
detailed in `knowledge-base/cli-bundling.md`.

**Standalone engine, shipped:** the desktop app spawns `houston-engine`
as a subprocess on startup (sidecar via Tauri `externalBin`), parses
the stdout `HOUSTON_ENGINE_LISTENING` banner for `{port, token}`, and
talks to it over HTTP+WS — the same way a remote client on a VPS
would. The supervisor (`app/src-tauri/src/engine_supervisor.rs`) binds the
engine's lifetime to the app's: on Unix via piped stdin (engine exits on
EOF when the parent dies), on Windows via a kill-on-close Job Object
(`TerminateProcess` never delivers stdin EOF, so the job is what reaps the
engine and its children). No orphan engines holding ports. All domain
Tauri commands are deleted — only
OS-native glue remains in `app/src-tauri/src/commands/`.

## App-side Rust (`app/`)

- `app/houston-tauri/` — Tauri adapter. Binds engine crates (db, event
  queue, schedulers, watcher) to Tauri state and emits Tauri events.
  The engine supervisor uses the same crates but speaks HTTP/WS
  externally. **Not part of Engine.**
- `app/src-tauri/` — Tauri binary. Depends on `houston-tauri` + engine
  crates. Spawns the engine subprocess in `setup()`, waits for
  `/v1/health`, injects `window.__HOUSTON_ENGINE__` handshake before
  the React tree mounts (see `EngineGate` in `app/src/main.tsx`).

## App boot — WebView compatibility gate

Tauri renders through the *system* WKWebView, so our minimum engine is the
user's OS, not something we ship. macOS Monterey commonly runs WebKit < 16.4
(no regex lookbehind); the markdown stack ships a lookbehind literal, so the
bundle throws `SyntaxError: invalid group specifier name` at module-eval —
before React mounts — and the screen stays blank (issue #102). No error
boundary can catch a module-eval crash.

`app/public/compat-gate.js` is a classic (non-module) `<script defer>` in
`index.html`. `defer` scripts and module scripts run in document order after the
document is parsed, so the gate runs before the deferred app bundle (it is first
in the document) yet after `#root` exists. It must NOT be parser-blocking: a
parser-blocking `<head>` script runs before `<body>`, so `getElementById("root")`
returns null and nothing paints — the white screen would persist. `public/` is
copied verbatim (never bundled), so the gate stays free of the modern syntax it
detects. It feature-tests lookbehind via the `RegExp` *constructor* (a literal
would fail to parse on the very engines it targets) and, when unsupported, paints
a localized "update macOS" message instead of a white screen.

Invariants: keep it a classic `<script defer>` (not `type=module`, never
parser-blocking), dependency-free, and never author a lookbehind / `v`-flag
regex *literal* in it. Defense in depth:
the `ui/chat` markdown renderer is wrapped in `@houston-ai/core`'s
`ErrorBoundary`, so a render-time regex failure degrades to raw text rather
than blanking the chat. `minimumSystemVersion` in `tauri.conf.json` stays at
`10.15` (install-time native-binary floor) — the capability gate, not the OS
version, decides whether the UI can actually run.

## App boot — gate chain must never hang on the engine

After the compat gate, the React tree mounts behind a chain of gates that each
withhold the first paint until something resolves: `EngineGate` (waits for
`houston-engine-ready`) → `LanguageGate` (waits for the locale preference) →
`DisclaimerGate` → `<App/>` (`app/src/main.tsx`). A gate that blocks on an
engine call with no bound turns a single slow/stalled request into a permanently
blank window — the engine can be healthy in 50ms and the user still never sees
a UI. That was issue #439: v0.4.17 (#390) made `LanguageGate` block on a
best-effort `GET /workspaces` (`use-locale-preference.ts`); when that request
never settled, `<App/>` never mounted, `frontend.log` went silent, and users
force-quit (which then triggered macOS's "reopen windows" dialog).

Invariant: **a boot gate may only block on what it strictly needs, and that
call must be bounded.** Best-effort enrichment (per-workspace locale override,
etc.) is applied on arrival, never gated on — see `localeGateIsLoading` in
`app/src/lib/locale.ts`. Engine handlers on the boot path must not run
synchronous filesystem work directly on the async runtime (`workspaces::list`
now uses `spawn_blocking`) so a slow disk read can't wedge a tokio worker.

## UI packages (`ui/`)

11 packages under `@houston-ai/`: `core, chat, board, layout, events,
routines, skills, review, agent, agent-schemas, engine-client`.

Mostly internal. `@houston-ai/engine-client` is the one package we
expect third-party devs to install — it's the TypeScript front door to
the engine HTTP+WS protocol. `@houston-ai/agent-schemas` ships the
JSON schemas that Rust embeds via `include_str!` — source of truth for
the typed `.houston/<type>/<type>.json` layout.

## Current gap to vision

| Goal | Status |
|------|--------|
| Clear product dirs | ✅ done |
| App ↔ Engine clear boundary | ✅ `app/houston-tauri` split |
| UI standalone | ✅ |
| Full desktop UI in the browser | ✅ `packages/web` composes `app/src` with `@tauri-apps/*` shimmed; typecheck + build green, parity guard in CI. Live engine click-through + web OAuth are the open follow-ups (see `packages/web/README.md`) |
| Engine reusable by non-Tauri frontends | ✅ binary ships as Tauri sidecar + standalone; desktop app consumes it over HTTP/WS, no in-process coupling |
| Reference custom-frontend integration | ➖ `examples/smartbooks/` was shipped, then REMOVED in the convergence sweep |
| Always On | ➖ `always-on/` was shipped, then REMOVED; the TS-host self-host path is `selfhost/` |
| Teams / Cloud | 🟢 Cloud is LIVE (beta): per-turn Cloud Run hosting + locked-down code sandbox + GCS workspaces + connect-once subscriptions, behind the control plane on GKE (`cloud/code-execution.md`). Teams (org workspaces, per-seat) modeled but not built. |
| Store populated | 🟡 release-bundled MVP: `store/catalog.json` + `store/agents/*`; community sharing TBD |
| Binary file read route (xlsx, pdf download through HTTP) | ✅ `GET /v1/agents/files/download` (engine) + `GET /agents/:id/files/download` (cloud control plane); web Files tab gets Preview + Download, desktop keeps OS open/reveal |
| Windows support (Rust engine layer) | ✅ `cargo check --target x86_64-pc-windows-gnu` clean across the workspace; platform-specific branches (taskkill vs kill, PATH separator, symlink_dir) covered. See `knowledge-base/platform-matrix.md`. |

## Direction of work
- **library-first** — new reusable capability → ui/ or engine/, then consumed by app/
- **app-first** — feature needed in app/, extract to library when reuse appears
- **single-layer** — only one area touched

Not sure? Start in app/. Extract later.
