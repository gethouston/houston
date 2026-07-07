# Architecture

> **Source of truth for the engine direction: `convergence/README.md`.** This doc is the repo-shape overview. Houston runs ONE TypeScript engine for desktop AND cloud — the **pi runtime** behind the **host**. The legacy Rust `engine/` (17 crates) and its Tauri adapter (`app/houston-tauri/`) have been **deleted**; the only Rust left is the thin desktop shell (`app/src-tauri`) that spawns the host as a sidecar.

## The engine (the convergence target)

ONE deployment-agnostic server — the **host** (`packages/host`, `@houston/host`) — with ONE router, ONE `authorize()` seam, ONE domain layer, and **two adapter profiles** (local desktop vs cloud multi-tenant) wired in `main()`. The only agent loop is the **pi runtime** (`packages/runtime`, TS/Node in dev + Docker; Bun only for the compiled desktop sidecar) — single-workspace, single-credential, tenancy-free. Domain logic lives once in `packages/domain`; wire types + zod in `packages/protocol` (**protocol v3**). The frontend (`app/src`, also `packages/web`) talks ONLY to the host via `@houston-ai/engine-client`, every deployment.

- **Desktop** = the host booted with local adapters (FS store/vfs, subprocess pi launcher, single-user identity, FS watcher → events), spawned by the Tauri shell (`app/src-tauri`) as a Bun-compiled sidecar; normal dev/test/Docker runs use pnpm + Node. The Tauri shell is the only Rust left — OS-native glue that spawns the host sidecar and talks HTTP + SSE to it.
- **Cloud** = the same open host/runtime image running as one engine pod per agent behind the private gateway. The multi-tenant CLOSED control plane (`@houston/host-cloud`: Pg/GCS/GKE/Redis adapters + operator-admin + cloud `main.ts`) was RETIRED and deleted — an architecture the shipped cloud moved past; it survives only in git history.
- **Open/closed seam** = everything in this repo is OPEN and may never import a cloud library or closed adapter; closed policy lives out-of-repo (the private gateway) and binds behind ports. Documented in `BOUNDARY.md` (repo root), machine-enforced by `scripts/check-boundaries.mjs` (`pnpm check:boundaries`, wired into the PR CI gate).
- **Self-host** = the local host in Docker behind Caddy TLS (`selfhost/`).
- **Managed hosted cloud** (the committed hosted architecture) = the same open self-host/local-profile container as a K8s engine pod, one pod/PVC per agent inside a per-org namespace, fronted by a private gateway. The public repo provides `VITE_HOSTED_ENGINE_URL`, the `selfhost/Dockerfile` `engine-pod` target, `HOUSTON_MANAGED_CLOUD=1` capabilities, and `HOUSTON_CODE_EXECUTION=local` (in-container bash, HOU-669); the private repo owns gateway auth, K8s resources, and network policy.
- **Providers** are in-process in pi: Anthropic + OpenAI/Codex + GitHub Copilot OAuth, plus API-key providers OpenCode Zen/Go, OpenRouter, DeepSeek, Google Gemini, Amazon Bedrock, and MiniMax global (`minimax`, not `minimax-cn`). **No provider CLIs** — the bundled codex/claude/gemini CLIs went away with the Rust engine. Bedrock uses pi-ai's native `amazon-bedrock` provider; Houston maps the stored key to Bedrock's `bearerToken` request option in `packages/runtime/src/ai/bedrock.ts`. The runnable provider/model catalog is served by `GET /v1/catalog` (pi's baked registry) and hydrated frontend-side by the single-owner `use-provider-catalog.ts` hook, which throws (never silently degrades a 404 to `[]`) and toasts on any load or empty-payload failure while a static seed keeps the UI rendering — full flow in `knowledge-base/agent-manifest.md`.
- **Composio** (and future integrations) = an in-process REST tool behind the `IntegrationProvider` port (`packages/host/src/integrations/`), platform mode: Houston's one project key server-side (`COMPOSIO_API_KEY` on the cloud host / self-host; the desktop forwards through the cloud gateway with the user's Supabase session, `HOUSTON_INTEGRATIONS_URL`), users only OAuth the apps themselves — no per-user Composio account, no CLI.
- **Multiplayer / Teams (paid cloud only) — SHIPPED** = orgs with owner/admin/user roles (UI Owner/Manager/Member), a per-agent access level `manager|user` on `gateway.agent_assignments`, per-(user, agent) integration grants bounded by an org∩agent allowlist ceiling, a per-agent allowed-models ceiling with per-user model choice, invites/audit/usage, and acting-as identity (the driving user's credentials per turn; routines act as their creator). The **gateway is the sole enforcer** — it classifies every request use vs configure (dispatch-scope) and 403s configure-scope writes from non-managers; the admin "see/manage all agents" rule is GONE (an admin only sees assigned agents). The open repo carries a FULL capability-gated client surface (role matrix v2, org dashboard, Share dialog, allowlists) whose gates are cosmetic. Live server contracts: `cloud/docs/contracts/C3` (v2 matrix), `C4` (grants + effective allowlist), `C7-teams.md` (the older `convergence/contracts/C1..C5` are historical). Client surface: `knowledge-base/teams.md` (feature-detect on `capabilities.multiplayer` + `teams`).
- **Drift prevention** = port contract suites + the dual-profile parity test (`packages/host/src/dual-profile.test.ts`) + `/v1/capabilities` (no "am I web/desktop" branches). Gate spec: `convergence/parity-checklist.md`. PR CI gate: `.github/workflows/ci.yml`.
- **Removed (deleted, not just planned):** the legacy Rust `engine/` + `app/houston-tauri/` (the Tauri adapter crate) + the CLI-bundling pipeline (`cli-deps.json`, `scripts/fetch-cli-deps.sh`); `mobile/` + `houston-relay/` (mobile PWA + tunnel); `examples/smartbooks/` (custom-frontend reference); `always-on/` (the legacy Rust-engine VPS image — superseded by `selfhost/`); worktrees, store/marketplace, claude-CLI install. Single personal workspace on desktop/self-host; multiplayer Teams (orgs/roles/sharing) SHIPPED in the paid hosted cloud (`knowledge-base/teams.md`).

---

Houston = open platform. Organized as **products + code libraries**.

## Products (end-user)

| Product | Dir | What |
|---------|-----|------|
| Houston App | `app/` | Desktop app (Tauri 2). Non-technical users create agents, run parallel agent sessions. `app/src` is the React frontend; `app/src-tauri` is the Rust shell that spawns the host sidecar. |
| Houston Web | `packages/web/` | The **full** desktop UI running in a plain browser tab. Composes `app/src` verbatim; `@tauri-apps/*` aliased to browser shims. Talks to `packages/host` over protocol v3 (`VITE_CONTROL_PLANE_URL`, legacy env name; external host via `VITE_NEW_ENGINE_URL`). See `packages/web/README.md`. |
| Houston Mobile | ~~`mobile/`~~ **REMOVED** | Was a React PWA served over the relay. Cut in the convergence; `mobile/` + `houston-relay/` are deleted. (A native SwiftUI iOS surface over `@houston/sdk` is a separate, in-progress track — see `knowledge-base/client-architecture.md`.) |
| Houston Store | ~~`store/` UI~~ **REMOVED UI** | The store/marketplace surface was cut. `store/` remains as legacy bundled catalog data only. |
| Houston Website | `website/` | gethouston.ai landing. |
| Houston Always On | ~~`always-on/`~~ **REMOVED** | Was a one-click VPS deploy of the Rust engine. Superseded by `selfhost/` (the TS host in Docker behind Caddy); `always-on/` is deleted. |
| Houston Teams | (no dir) | Hosted multiplayer orgs — roles, per-agent access, sharing, templates. **LIVE (beta).** No dedicated app dir: the gateway (private `cloud/` repo) enforces it and the open repo carries a capability-gated client surface across `app/` + `ui/engine-client`. See `knowledge-base/teams.md`. |

## Code libraries

| Library | Dir | What | Consumers |
|---------|-----|------|-----------|
| Houston UI | `ui/` | `@houston-ai/*` React components (props-only, no store/Tauri imports). | App, Web, future hosted frontends |
| Houston Engine | `packages/{runtime,host,domain,protocol}` | **The single TypeScript engine.** pi runtime (the only agent loop) behind the host, protocol v3. Frontend-agnostic. Open source. | App (via the Tauri-shell sidecar), Web, self-host, Cloud |
| Houston Cloud | `cloud/` + `packages/{host,runtime,code-sandbox,web}` + the private gateway repo | **LIVE (beta) — the committed hosted architecture.** Managed K8s engine pod/PVC per agent (per-org namespaces), public open host/runtime image, private gateway. The multi-tenant `@houston/host-cloud` control plane was retired and deleted (git history). Start at `cloud/README.md`, `cloud/code-execution.md`, `selfhost/README.md`. | Houston Web / hosted desktop users |

## The engine is frontend-agnostic

**The host is the reusable backend.** Devs run it themselves (open source) or rent it via Cloud, and put ANY frontend on top over protocol v3 HTTP+SSE — the Houston App is just ONE consumer, `packages/web` is the browser one.

- The host + pi runtime stay pure TypeScript: no Tauri, no React, no webview assumption.
- `app/src-tauri` is the **shell** that applies the engine to the Tauri desktop frontend (spawn sidecar, inject handshake, OS-native glue). It lives under `app/`, not in `packages/`.
- Self-host + managed cloud consume the SAME host image over the network (`selfhost/`, the engine pod).

## Infra dirs (not products)

| Dir | What |
|-----|------|
| `packages/` | The converged TypeScript engine — `runtime`, `host`, `domain`, `protocol`, `web`, `code-sandbox`, `sdk`, `runtime-client`, `design-tokens`, `fake-host`. See `convergence/README.md`. |
| `convergence/` | The single-engine convergence plan + status. Source of truth for the architecture direction. |
| `selfhost/` | Self-host the TS engine on a VPS (Docker + Caddy TLS). |
| `knowledge-base/` | Repo knowledge docs. Loaded on demand. |
| `scripts/` | Version bump, release helpers, and the host-sidecar compile (`build-host-sidecar.sh`). |
| ~~`houston-relay/`~~ **REMOVED** | Was the Cloudflare Worker + Durable Object reverse-tunnel for the mobile PWA. Deleted with the mobile/tunnel cut. |
| ~~`examples/smartbooks/`~~ **REMOVED** | Was the reference custom-frontend consumer of the engine. Deleted in the convergence sweep; the canonical non-Tauri consumer is now `packages/web`. |

## App-side Rust (`app/src-tauri`)

`app/src-tauri/` is the Tauri binary — an OS-native shell, no domain logic.

- Spawns the **host sidecar** in `setup()` (Tauri `externalBin`, staged at `binaries/houston-engine-<triple>` — the name is kept on purpose), parses the stdout `HOUSTON_HOST_LISTENING` banner for `{port, token}`, injects `window.__HOUSTON_ENGINE__` before the React tree mounts (see `EngineGate` in `app/src/main.tsx`), and talks HTTP/WS+SSE.
- The supervisor binds the sidecar's lifetime to the app's: on Unix via piped stdin (the host exits on EOF when the parent dies), on Windows via a kill-on-close Job Object. No orphan hosts holding ports.
- OS-native glue only: Keychain auth (`auth.rs`), deep links, the auto-updater, file open/reveal, crash reporting. The `~/Documents/Houston → ~/.houston/workspaces` filesystem migration also lives in the shell.
- `app/houston-tauri/` (the old engine-adapter crate that bound the Rust engine's crates to Tauri) was **DELETED** with the Rust engine — there is no in-process engine to adapt anymore.

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
`houston-engine-ready` — i.e. the host sidecar handshake) → `LanguageGate` (waits
for the locale preference) → `DisclaimerGate` → `<App/>` (`app/src/main.tsx`). A
gate that blocks on an engine call with no bound turns a single slow/stalled
request into a permanently blank window — the host can be healthy in 50ms and the
user still never sees a UI. That was issue #439: v0.4.17 (#390) made `LanguageGate`
block on a best-effort `GET /workspaces` (`use-locale-preference.ts`); when that
request never settled, `<App/>` never mounted, `frontend.log` went silent, and
users force-quit (which then triggered macOS's "reopen windows" dialog).

Invariant: **a boot gate may only block on what it strictly needs, and that
call must be bounded.** Best-effort enrichment (per-workspace locale override,
etc.) is applied on arrival, never gated on — see `localeGateIsLoading` in
`app/src/lib/locale.ts`. Host handlers on the boot path must likewise not wedge on
slow filesystem work, so a cold disk read can't stall the first paint.

## UI packages (`ui/`)

`@houston-ai/*` React packages: `core, chat, board, layout, events, routines,
skills, review, agent, agent-schemas, engine-client`.

Mostly internal. `@houston-ai/engine-client` is the one package we expect
third-party devs to install — the TypeScript front door to the host's protocol v3
(HTTP + SSE). `@houston-ai/agent-schemas` ships the JSON schemas for the typed
`.houston/<type>/<type>.json` layout; `packages/domain` seeds them into each
agent on create.

## User interaction lifecycle (ask_user / request_connection)

When an agent must block on the user — a question, a choice, an approval, or a
missing integration — it never leaves the ask sitting in plain text. Two runtime
tools drive ONE lifecycle across runtime → protocol → SDK → UI:

- **Tool → holder.** `ask_user` (all modes) and `request_connection`
  (integration-gated) record into a per-turn holder — an `AsyncLocalStorage`
  established for the duration of `session.prompt()`
  (`packages/runtime/src/session/interaction.ts`, mirrors acting-context). The
  holder MERGES the two tools into ONE step sequence: `ask_user` supplies the
  question steps (1–3 per call, a second call replaces them), each
  `request_connection` appends a connect step (deduped by toolkit); questions
  always order before connects. The prompt tells the model to batch everything
  blocking into one turn — e.g. "send an email to john" becomes two question
  steps (recipient, content) plus a connect step (email app). A fresh holder per
  turn IS the reset; recording outside a turn is a no-op. The Claude-SDK
  subprocess backend (a `claude` subprocess that only sees SDK built-ins) reaches
  the SAME tools through an in-process MCP server ("houston", tools surface as
  `mcp__houston__*`) in `packages/runtime/src/backends/claude/custom-tools.ts` —
  so an `anthropic`-backed agent is not told to use tools it lacks.
- **Holder → done frame.** After `prompt()` resolves, exec-turn (and the cloud
  per-turn path) reads the holder and attaches its value to the clean terminal
  `done` frame's optional `pendingInteraction` (`PendingInteraction` =
  `{ steps: InteractionStep[] }`, each step
  `{kind:"question", id, question, options?}` | `{kind:"connect", id, toolkit,
  reason?}`, `packages/protocol`, wire v3). Only the clean path carries it; an
  error frame never does.
- **Done frame → settle split.** The SDK folds the frame
  (`packages/sdk/src/modules/turns/turn-settle.ts`): a clean turn WITH an
  interaction settles `boardStatus: needs_you` and carries the interaction; a
  clean turn WITHOUT one settles the NEW terminal `boardStatus: done`. A user Stop
  / logged-out provider is a handled `needs_you` (never carrying an interaction);
  a real failure is `error`. `persistBoardStatus` writes `{ status,
  pending_interaction }` (the web adapter PATCHes it); Activity persists
  `pending_interaction` (null-cleared at turn start) and the assistant
  `ChatMessage` persists `pendingInteraction`, so a `needs_you` card survives
  reload.
- **Settle → composer card → answer-as-new-turn.** A pending interaction REPLACES
  the composer with `ChatInteractionCard` (`@houston-ai/chat`, inventory v6): a
  one-step-at-a-time stepper ("1 of X" progress, back chevron, gray surface with
  white option rows and an always-visible free-text escape hatch on question
  steps). Connect steps render through the `renderConnect` prop (the app injects
  `IntegrationConnectCard`; already-connected toolkits auto-advance). Answers are
  held until the sequence completes, then sent as ONE composed user message
  (`question: answer` lines, plus `Connected <app>.` lines); connect-ONLY
  sequences keep the hidden auto-continue, fired on sequence completion — nothing
  special on the wire.

The old `#houston_toolkit=` markdown-link connect hack is GONE from the prompt and
tool guidance; the app's legacy link-card renderer survives only to render old
transcripts. Client-side settle detail: `knowledge-base/client-architecture.md`.

## Turn modes (execute / plan)

Each turn optionally pins a `TurnMode`: `"execute" | "plan"`
(`packages/protocol/src/conversation.ts`). `execute` is full read/write/act,
today's only behavior for an UNPINNED turn — routines and per-turn cloud
workspaces never inherit a mode, so they always execute. Deliberately NOT part
of `Settings` (which persists `effort`): mode rides the per-turn pin only, so
an unpinned turn can never accidentally end up read-only.

`plan` clamps the turn to a read-only tool subset — `PLAN_MODE_TOOL_NAMES`
(`read, ls, grep, find, ask_user`, `packages/runtime/src/session/tool-selection.ts`)
with `edit, write, bash, run_code`, and every integration tool dropped — plus a
system-prompt overlay (`PLAN_MODE_OVERLAY`,
`packages/runtime/src/session/plan-overlay.ts`) that tells the model to
investigate and propose a plan rather than act. `switchModeIfNeeded`
(`packages/runtime/src/session/conversation-cache.ts`) rebuilds the session
when the pinned mode differs from the live one, keyed by conversation id. Both
backends honor it: the pi backend swaps its tool allowlist; the Claude-SDK
backend keeps its SDK `permissionMode` default and simply gets no integration
tools, so plan mode still holds.

App side: a Mode pill in the composer footer
(`app/src/components/chat-mode-selector.tsx`) — persona labels **Doer**
(`execute`) and **Planner** (`plan`), the wire values are unchanged — remembered
per-agent as `mode`
in `.houston/config/config.json` (composer memory only — never synced to
engine `Settings`). Every user-typed send forwards the pin explicitly as
`modeOverride`.

**Gotcha.** Mode must ride EVERY send path explicitly, unlike effort (which
syncs through `Settings` and so is implicitly present on every send) — a send
path that forgets `modeOverride` silently degrades to `execute`. Per-turn
cloud workspaces drop chat-body pins entirely; that's pre-existing and not
specific to plan mode.

## Current gap to vision

| Goal | Status |
|------|--------|
| Clear product dirs | ✅ done |
| One engine, no drift | ✅ pi runtime behind the host, dual-profile parity test + port contract suites; the Rust engine is deleted |
| UI standalone | ✅ |
| Full desktop UI in the browser | ✅ `packages/web` composes `app/src` with `@tauri-apps/*` shimmed; typecheck + build + Playwright e2e green in CI (`packages/web/README.md`) |
| Engine reusable by non-Tauri frontends | ✅ the host ships as a Tauri sidecar + a standalone binary + a Docker image; every frontend consumes it over protocol v3, no in-process coupling |
| Reference custom-frontend integration | ➖ `examples/smartbooks/` was shipped, then REMOVED; the canonical non-Tauri consumer is `packages/web` |
| Always On | ➖ `always-on/` was REMOVED; the TS-host self-host path is `selfhost/` |
| Teams / Cloud | 🟢 Cloud is LIVE (beta): per-agent engine pods running the open host/runtime behind the private gateway, locked-down code sandbox, connect-once subscriptions (the closed `@houston/host-cloud` control plane was retired and deleted). **Teams v2 SHIPPED**: orgs, owner/admin/user roles, per-agent access `manager|user`, sharing, templates, invites/audit/usage — the gateway is the sole enforcer (dispatch-scope use vs configure), the open repo carries the capability-gated client surface (`knowledge-base/teams.md`). |
| Store populated | 🟡 release-bundled MVP: `store/catalog.json` + `store/agents/*`; community sharing TBD |
| Binary file read route (xlsx, pdf download over HTTP) | ✅ host file routes serve preview/download for web; desktop keeps OS open/reveal affordances. |
| Windows support | ✅ the host sidecar bun-compiles for windows-x64 + arm64; the Tauri shell links MSVC per arch (`.github/workflows/release.yml`). |

## Direction of work
- **library-first** — new reusable capability → `ui/` or `packages/` (engine), then consumed by `app/`
- **app-first** — feature needed in `app/`, extract to a library when reuse appears
- **single-layer** — only one area touched

Not sure? Start in `app/`. Extract later.
