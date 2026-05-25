# Architecture

Houston = open platform. Organized as **6 products + 3 code libraries**.

## The 6 products (end-user)

| Product | Dir | What |
|---------|-----|------|
| Houston App | `app/` | Desktop app (Tauri 2). Non-technical users create agents, run parallel terminal sessions. |
| Houston Mobile | `mobile/` | React PWA served from `tunnel.gethouston.ai`. No native app — pure web, same origin as the relay. |
| Houston Store | `store/` | Release-bundled registry of pre-built Houston agents. One-click install. |
| Houston Website | `website/` | gethouston.ai landing. |
| Houston Always On | `always-on/` | One-click deploy Engine to VPS/microVM. Agents 24/7. **TBD.** |
| Houston Teams | `teams/` | Hosted multi-tenant agent pool w/ perms. **TBD.** |

## The 3 code libraries

| Library | Dir | What | Consumers |
|---------|-----|------|-----------|
| Houston UI | `ui/` | `@houston-ai/*` React components | App, Mobile, future hosted products' frontends |
| Houston Engine | `engine/` | Rust crates. **Frontend-agnostic backend.** Open source. Anyone self-hosts or uses as desktop-app backend. | App (via `app/houston-tauri` adapter), Always On, Teams, Cloud customers |
| Houston Cloud | `cloud/` | Managed Engine deployments. **TBD.** | Third-party devs building on Engine |

## Key distinction: Engine is standalone

**Houston Engine is the reusable backend.** Devs run it themselves (open source) or rent it via Cloud. Devs put ANY frontend on top — Houston App is just ONE consumer.

- Engine stays pure Rust, no Tauri, no React, no webview assumption
- `app/houston-tauri/` is the **adapter** that applies Engine to the Tauri desktop frontend. Lives under `app/`, not `engine/`.
- Future Always On + Teams consume Engine over network (HTTP/WS — **not yet built**)

## Infra dirs (not products)

| Dir | What |
|-----|------|
| `houston-relay/` | Cloudflare Worker + Durable Object at `tunnel.gethouston.ai`. Reverse-tunnel proxy (desktop engine dials outbound; mobile traffic multiplexes over that link) AND static host for the mobile PWA. One origin for both so Safari sees first-party traffic. Deploys separately. |
| `examples/` | Reference consumers of `houston-engine` for third-party devs. First entry: `examples/smartbooks/` — a custom React frontend, own brand, zero `@houston-ai/*` UI deps. Lives in the monorepo (not a separate repo) so it stays in sync with protocol changes. |
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
would. The supervisor (`app/src-tauri/src/engine_supervisor.rs`) pipes
stdin so engine sees EOF on parent death and exits cleanly (no orphan
engines holding ports). All domain Tauri commands are deleted — only
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

`app/public/compat-gate.js` is a classic (non-module) `<script>` in
`index.html`. Classic parser-blocking scripts run before any deferred module
bundle, and `public/` is copied verbatim (never bundled), so the gate stays
free of the modern syntax it detects. It feature-tests lookbehind via the
`RegExp` *constructor* (a literal would fail to parse on the very engines it
targets) and, when unsupported, paints a localized "update macOS" message
instead of a white screen.

Invariants: keep it a classic script (not `type=module`), dependency-free, and
never author a lookbehind / `v`-flag regex *literal* in it. Defense in depth:
the `ui/chat` markdown renderer is wrapped in `@houston-ai/core`'s
`ErrorBoundary`, so a render-time regex failure degrades to raw text rather
than blanking the chat. `minimumSystemVersion` in `tauri.conf.json` stays at
`10.15` (install-time native-binary floor) — the capability gate, not the OS
version, decides whether the UI can actually run.

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
| Engine reusable by non-Tauri frontends | ✅ binary ships as Tauri sidecar + standalone; desktop app consumes it over HTTP/WS, no in-process coupling |
| Reference custom-frontend integration | ✅ `examples/smartbooks/` — Vite + React, own brand, ~400 LOC TSX, proven end-to-end |
| Always On | ✅ Dockerfile + compose + systemd unit + README all shipped |
| Teams / Cloud | 🟡 Identity foundation shipped (Supabase Google SSO + Keychain sessions — see `knowledge-base/auth.md`); Cloud API surface TBD |
| Store populated | 🟡 release-bundled MVP: `store/catalog.json` + `store/agents/*`; community sharing TBD |
| Binary file read route (xlsx, pdf download through HTTP) | ❌ workaround: use `/v1/shell` with `open`/`xdg-open` to hand binary files to host OS |
| Windows support (Rust engine layer) | ✅ `cargo check --target x86_64-pc-windows-gnu` clean across the workspace; platform-specific branches (taskkill vs kill, PATH separator, symlink_dir) covered. See `knowledge-base/platform-matrix.md`. |

## Direction of work
- **library-first** — new reusable capability → ui/ or engine/, then consumed by app/
- **app-first** — feature needed in app/, extract to library when reuse appears
- **single-layer** — only one area touched

Not sure? Start in app/. Extract later.
