# Houston Engine — Wire Protocol

Source of truth for the HTTP + WebSocket contract spoken by `houston-engine`
and every client (desktop, mobile, CLI, third-party). Rust types live in
`engine/houston-engine-protocol`; TS types live in
`ui/engine-client/src/types.ts`. The Rust side wins conflicts.

## Versioning

| Field | Value |
|---|---|
| Protocol major | `1` (constant `PROTOCOL_VERSION`) |
| Engine version | crate `houston-engine-server` version |
| Version header | `X-Houston-Engine-Version: <semver>` on every response |
| Breaking changes | require protocol major bump + client version guard |

Clients refuse to talk to an engine whose major `v` exceeds what they know.

## Transport

- **HTTP** under `/v1/*` — resource-oriented REST. `Content-Type: application/json`.
- **WebSocket** at `/v1/ws` — server-push events + lightweight client requests.

Loopback deploys bind `127.0.0.1:<random>`; remote deploys must opt in via
`HOUSTON_BIND_ALL=1`.

### CORS

Fully permissive: `allow_origin("*")`, `allow_methods(Any)`,
`allow_headers(Any)`. This is safe because the bearer token is not a
CORS credential (no cookies), and because loopback deploys aren't
browser-reachable from the public internet. Browser clients from any
origin can call the engine as long as they carry a valid token.

Keep it this way — the WKWebView in the desktop app is cross-origin to
`127.0.0.1:<port>`, and trimming the allow-list has caused PUT/PATCH
preflights to fail (e.g. `setPreference` returning "Load failed" in
Safari/WKWebView). See `engine/houston-engine-server/src/lib.rs`.

## Auth

Bearer token. Three accepted locations (server checks all):

- `Authorization: Bearer <token>` — required for REST, preferred for WS in native clients.
- `?token=<token>` — convenience for CLIs and browsers that cannot set WS headers.
- `Sec-WebSocket-Protocol: houston-bearer.<token>` — fallback for browser WS.

Token generation: the binary auto-generates a 48-char alphanumeric token on
first run unless `HOUSTON_ENGINE_TOKEN` is set. It is written (mode 0600) to
`~/.houston/engine.json`. The desktop supervisor reads that file before
injecting `window.__HOUSTON_ENGINE__`.

## REST conventions

- Plural nouns: `/v1/workspaces`, `/v1/agents/{path}/sessions`.
- Non-CRUD actions as sub-resource POSTs: `POST /v1/agents/{p}/sessions/{k}:cancel`.
- Path IDs always URL-encoded.

### Error body

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "workspace 7f3e... not found",
    "details": null
  }
}
```

`code` is a fixed enum: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`BAD_REQUEST`, `CONFLICT`, `INTERNAL`, `UNAVAILABLE`, `VERSION_MISMATCH`.
HTTP status maps 1:1 (see `engine-server/src/routes/error.rs`).

### Current routes

Full surface live. Every mutating route emits matching `HoustonEvent` on
broadcast bus. 16 route modules wired in
[`houston-engine-server/src/lib.rs`](../engine/houston-engine-server/src/lib.rs).
Integration tests in `engine/houston-engine-server/tests/` — one file per
module.

**Health**
| Method | Path | Description |
|---|---|---|
| GET | `/v1/health` | `{status, version, protocol}` |
| GET | `/v1/version` | `{engine, protocol, build}` |
| GET | `/v1/ws` | WebSocket upgrade |

**Workspaces + nested agent CRUD**
| Method | Path | Description |
|---|---|---|
| GET | `/v1/workspaces` | List |
| POST | `/v1/workspaces` | Create |
| DELETE | `/v1/workspaces/:id` | Delete |
| POST | `/v1/workspaces/:id/rename` | Rename |
| PATCH | `/v1/workspaces/:id/locale` | Set/clear the per-workspace UI-locale override (`{ locale: "es" \| null }`) |
| PATCH | `/v1/workspaces/:id/provider` | Set provider/model |
| GET | `/v1/workspaces/:id/context` | Read shared `WORKSPACE.md` + `USER.md` |
| PUT | `/v1/workspaces/:id/context` | Write shared `WORKSPACE.md` + `USER.md` |
| GET | `/v1/workspaces/:id/agents` | List agents in workspace |
| POST | `/v1/workspaces/:id/agents` | Create agent |
| DELETE | `/v1/workspaces/:id/agents/:agent_id` | Delete agent |
| PATCH | `/v1/workspaces/:id/agents/:agent_id` | Update agent metadata (`color`) |
| POST | `/v1/workspaces/:id/agents/:agent_id/rename` | Rename agent |
| POST | `/v1/workspaces/install-from-github` | Import workspace template |

**Sessions** (`agent_path` path-segment, URL-encoded)
| Method | Path | Description |
|---|---|---|
| POST | `/v1/agents/:agent_path/sessions` | Start turn |
| POST | `/v1/agents/:agent_path/sessions/onboarding` | Start onboarding turn |
| POST | `/v1/agents/:agent_path/sessions/:key:cancel` | Kill CLI process tree (verified, SIGKILL escalation); a tombstone catches a CLI that spawns after Stop |
| GET | `/v1/agents/:agent_path/sessions/:key/history` | Load chat history |
| POST | `/v1/sessions/summarize` | Activity title/description |

`POST /v1/sessions/summarize` accepts `{ message, agentPath?, provider?, model? }`.
It resolves provider/model from explicit fields, then `agentPath`, then default
Anthropic. It is best-effort: provider CLI errors, timeouts, or malformed JSON
return a deterministic fallback title instead of failing the client flow. Do
not hardcode Claude for this path: Codex-only users may not have Claude Code.

Chat session starts are queued per `sessionKey`, not per `workingDir`.
Follow-up turns inside the same conversation wait and resume in order.
The desktop app keeps mid-run follow-ups in a visible local queued-message
strip, lets users remove them, then submits the remaining queued text as one
combined turn when the active run finishes. The engine queue remains the
protocol safety net for other clients and direct API callers.
Different sessions in the same folder run in parallel. Cancelling a session
invalidates any queued turns for that session key. If multiple sessions overlap
in one folder, file-change attribution is skipped for those overlapping runs
because the diff cannot be assigned to one model safely. On successful
non-overlapping completion, the engine may emit and persist a `FeedItem` with
`feed_type: "file_changes"` and `data: { created: string[], modified:
string[] }`; clients should render this as session-owned project artifacts.
Provider/tool execution failures that need user recovery UI are emitted as
`feed_type: "tool_runtime_error"` with `data: { kind: "local_tool" |
"provider_process", details: string }`. Clients should render a user-safe retry
and report-bug surface; `details` is diagnostic context for reports and logs,
not user-facing copy.

**Agent data** (`?agent_path=` query; writes emit event)
| Method | Path | Description |
|---|---|---|
| GET/POST | `/v1/agents/activities` | List/create |
| PATCH/DELETE | `/v1/agents/activities/:id` | Update/delete |
| GET/PUT | `/v1/agents/config` | Read/write project config |

Routine + routine-run CRUD is **not** here — there is one canonical surface
under `/v1/routines` + `/v1/routine-runs` (below); the engine-client points all
routine CRUD at it. (The old duplicate `/v1/agents/routines*` mirror, which
silently dropped `timezone`, was removed.)

**Agent files** (typed `.houston/` + project file browser)
| Method | Path | Description |
|---|---|---|
| GET/DELETE | `/v1/agents/files` | List / delete project file |
| POST | `/v1/agents/files/read` | Read typed data file |
| POST | `/v1/agents/files/write` | Write typed data file (emits event) |
| POST | `/v1/agents/files/seed-schemas` | Seed `.houston/<type>/<type>.schema.json` |
| POST | `/v1/agents/files/migrate` | Run idempotent migrations |
| POST | `/v1/agents/files/read-project` | Read project file |
| POST | `/v1/agents/files/rename` | Rename |
| POST | `/v1/agents/files/folder` | Create folder |
| POST | `/v1/agents/files/import` | Import paths |
| POST | `/v1/agents/files/import-bytes` | Import base64 bytes |

**Routines (the single routine surface — CRUD + scheduler)**

All routine + routine-run CRUD lives here (the engine-client targets it); the
`/v1/agents/routines*` mirror was deleted. Query params are camelCase
(`?agentPath`, `?routineId`). A routine carries optional
`provider`/`model`/`effort` overrides (absent = inherit the agent's config at
dispatch); the dispatcher resolves provider+model via
`sessions::resolve_provider_with_overrides` and effort via
`resolve_effort_with_override` (an effort the resolved provider rejects is
dropped), the same precedence a chat turn uses. Create/update/delete + run create/update
emit `RoutinesChanged` / `RoutineRunsChanged`.

| Method | Path | Description |
|---|---|---|
| GET/POST | `/v1/routines` | List/create (by `?agentPath`) |
| PATCH/DELETE | `/v1/routines/:id` | Update/delete |
| POST | `/v1/routines/:id/runs` | Create run |
| POST | `/v1/routines/:id/runs/:run_id:cancel` | Stop an in-flight run (kills the provider PID, marks status `cancelled`). 409 if the run is already terminal. Deleting a routine cascades to this for any `running` runs. |
| POST | `/v1/routines/:id/run-now` | Manual trigger. Returns once the run row is created (404 if the routine is gone, 409 if *this* routine already has a run in flight); the session runs on a detached task — follow it via `RoutineRunsChanged`. Different routines on one agent both run, serialized on the folder; the same routine can't double-run. |
| GET | `/v1/routine-runs` | List (optional `?routineId`) |
| PATCH | `/v1/routine-runs/:id` | Update run |
| POST | `/v1/routines/scheduler/start` | Start per-agent cron |
| POST | `/v1/routines/scheduler/stop` | Stop |
| POST | `/v1/routines/scheduler/sync` | Re-read routines, rebuild cron jobs |

Routine schedules are **standard Unix cron** (`0`/`7` = Sunday, weekdays `1-5`)
everywhere a human touches them — the UI builder, the stored `schedule` string,
and the frontend `nextFire` preview. The backend `cron` crate numbers days
`1-7` (`1` = Sunday) and rejects `0`, so `routines::cron_compat::to_engine_cron`
translates the day-of-week field at the single `spawn_cron` boundary. Without it
every weekly routine fired a day early and Sunday routines never scheduled
(issue #389). Keep cron generation/parsing on the standard convention; never
hand a raw `schedule` to `Schedule::from_str`.

**Conversations** (cross-agent read)
| Method | Path | Description |
|---|---|---|
| POST | `/v1/conversations/list` | List conversations for one agent |
| POST | `/v1/conversations/list-all` | List across many agents |

Conversation entries include the activity's stored `session_key` plus the
card metadata the agent board needs to render the same mission card in
cross-agent surfaces: `agent`, `routine_id`, and `worktree_path` when present.

**Skills**
| Method | Path | Description |
|---|---|---|
| GET/POST | `/v1/skills` | List/create |
| GET/PUT/DELETE | `/v1/skills/:name` | Load/save/delete |
| POST | `/v1/skills/community/search` | Search community registry, cached/throttled server-side |
| POST | `/v1/skills/community/install` | Install community skill |
| POST | `/v1/skills/repo/list` | List skills in a repo |
| POST | `/v1/skills/repo/install` | Install from repo |

**Store (agent registry + GitHub import)**
| Method | Path | Description |
|---|---|---|
| GET | `/v1/store/catalog` | Curated listing. Uses release-bundled `store/catalog.json` when available; remote API fallback remains for future hosted Store. |
| GET | `/v1/store/search?q=` | Search catalog |
| POST | `/v1/store/installs` | Install by `{repo, agentId}`. `repo: "houston-store/<id>"` installs bundled package incl. skills. GitHub repo form remains supported. |
| DELETE | `/v1/store/installs/:agent_id` | Uninstall |
| POST | `/v1/agents/install-from-github` | One-off install by URL |
| POST | `/v1/agents/check-updates` | Which installed agents have new versions |

**Preferences + providers + agent-configs**
| Method | Path | Description |
|---|---|---|
| GET/PUT | `/v1/preferences/:key` | String KV (DB-backed) |
| GET | `/v1/providers/:name/status` | `{cliInstalled, authState, installSource, cliPath}` |
| POST | `/v1/providers/:name/login` | Launch CLI login. Returns `BAD_REQUEST` for providers without an OAuth flow (e.g. `gemini`); callers must use the credentials route instead. Surfaces the OAuth URL via the `ProviderLoginUrl` WS event and the outcome via `ProviderLoginComplete`. Optional `?deviceAuth=true` selects the provider's headless device-code flow (OpenAI/codex `--device-auth`) for remote clients that can't receive the CLI's `localhost` OAuth callback; ignored by providers without a device variant (Claude keeps its paste-back code), omitted by the co-located desktop app. |
| POST | `/v1/providers/:name/login/code` | Relay the OAuth verification code the user pasted (paste-back flow, e.g. Claude on a remote/headless engine). Body: `{ code }`. Written to the CLI's stdin. Not used by codex's device-code flow, which self-completes after the user enters the `ProviderLoginUrl.user_code` on the provider's page. |
| POST | `/v1/providers/:name/login/cancel` | Abort an in-flight sign-in: kills the CLI subprocess and frees the in-flight slot so a retry isn't rejected as "already pending". Idempotent (no-op when nothing pending). Emits a benign `ProviderLoginComplete` (`success: false`, `error: null`) so pending spinners clear without an error toast. Fixes the stuck-spinner-after-closing-browser case. |
| POST | `/v1/providers/gemini/credentials` | Write `GEMINI_API_KEY` to `~/.gemini/.env` (atomic, mode 0600). Body: `{ apiKey }`. Provider-specific because Gemini is the only provider with file-backed credentials today. |
| GET | `/v1/agent-configs` | List installed agent definitions |

**Composio (MCP integrations)**
| Method | Path | Description |
|---|---|---|
| GET | `/v1/composio/status` | Full status bundle |
| GET | `/v1/composio/cli-installed` | Bool |
| POST | `/v1/composio/cli` | Install Composio CLI (no-op when bundled — see `knowledge-base/cli-bundling.md`) |
| POST | `/v1/composio/login` | Start OAuth |
| POST | `/v1/composio/login/complete` | Finish OAuth w/ `cli_key` |
| GET | `/v1/composio/apps` | Catalog |
| GET/POST | `/v1/composio/connections` | List / start connect |

**Claude Code (runtime install — proprietary CLI not bundled)**
| Method | Path | Description |
|---|---|---|
| GET | `/v1/claude/cli-installed` | Bool |
| GET | `/v1/claude/status` | `{installed, install_path, pinned_version, installed_version}` |
| POST | `/v1/claude/install` | Trigger background download + sha256 verify; progress streams as `ClaudeCliInstalling` events on the WS firehose |

**Worktrees + shell**
| Method | Path | Description |
|---|---|---|
| POST | `/v1/worktrees` | Create git worktree |
| POST | `/v1/worktrees/list` | List |
| POST | `/v1/worktrees/remove` | Remove |
| POST | `/v1/shell` | Run arbitrary shell (cwd + cmd) |

**Attachments**
| Method | Path | Description |
|---|---|---|
| POST | `/v1/attachments/uploads` | Create per-file upload sessions for a scope |
| PUT | `/v1/attachments/uploads/:upload_id/content` | Stream raw file bytes for one upload |
| GET | `/v1/attachments/:scope_id` | List attachment manifests for a scope |
| DELETE | `/v1/attachments/:scope_id` | Delete all attachments for a scope |

Attachment uploads are binary, one file per `PUT`. The create call declares
`scopeId`, `name`, `size`, and optional `mime`; the content call sends raw bytes
directly, not base64 JSON. The engine writes to a temp file, counts bytes,
computes SHA-256, rejects size mismatches or over-limit files, then atomically
commits a manifest + prompt-readable file path under
`<home>/cache/attachments/scopes/<scopeId>/`.

There is no user-facing attachment count cap. The SDK chunks large selections
into multiple create requests so a user can attach many files, such as dozens of
bank statements, while the engine still bounds each pending upload reservation.
Current limits: 25 upload sessions per create request, 100MB per file, 250MB per
create request, and 500MB per scope.

**Mobile tunnel**
| Method | Path | Description |
|---|---|---|
| GET  | `/v1/tunnel/status` | Tunnel connection state |
| POST | `/v1/tunnel/pairing` | Return stable phone-access QR payload (`<tunnelId>-<accessSecret>`) |
| POST | `/v1/tunnel/reset-access` | Rotate phone-access QR secret and revoke all device tokens |

See [`docs/mobile-architecture.md`](../docs/mobile-architecture.md) for the full flow — desktop engine opens an outbound WS to the Houston relay, which proxies mobile HTTP+WS AND serves the PWA bundle from the same origin. Phone pairing is durable: laptop sleep/shutdown keeps the same tunnel identity and phone tokens; only Settings → Disconnect all phones rotates the QR secret.

**Watcher**
| Method | Path | Description |
|---|---|---|
| POST | `/v1/watcher/start` | Start `notify` watch on agent dir |
| POST | `/v1/watcher/stop` | Stop |

## WebSocket envelope

Every WS frame is an `EngineEnvelope`:

```json
{
  "v": 1,
  "id": "b6e1c7d3-...",
  "kind": "event | req | res | ping | pong",
  "ts": 1712345678901,
  "payload": { ... }
}
```

- `kind: "event"` → `payload` is a `HoustonEvent` (same enum the frontend already consumes) or a `LagMarker` (`{type:"Lag", dropped: N}`).
- `kind: "req"` → client request. `{op:"sub"|"unsub", topics:[...]}`. Per-topic filtering is wired — subscribing to `"*"` gets the firehose; subscribing to specific topics limits what the forwarder sends.
- `kind: "res"` → server response to a prior `req` (future use).
- `kind: "ping" | "pong"` → keep-alive. Server emits a `ping` every 20s.

### Backpressure

Per-connection bounded `mpsc` with capacity 1024. On lag the server:

1. Coalesces consecutive `SessionStatus` and low-severity `FeedItem` updates.
2. Sends a `LagMarker` so the client knows to refetch.
3. Continues streaming once drained.

### Topics

Reserved topic names. Clients that want the firehose subscribe to the
special `*` topic. Subscribing to specific topics limits what the
forwarder sends — essential for remote clients where bandwidth matters.

| Topic | Payload variants |
|---|---|
| `*` | **Firehose.** Delivers every event regardless of its event_topic. The desktop app uses this so it doesn't need to track per-agent / per-session subscriptions. Remote clients should prefer narrower topics. |
| `session:{key}` | `FeedItem`, `SessionStatus`, `AuthRequired` |
| `agent:{path}` | `ActivityChanged`, `SkillsChanged`, `FilesChanged`, `ConfigChanged`, `ContextChanged`, `LearningsChanged`, `ConversationsChanged` |
| `routines:{agent}` | `RoutinesChanged`, `RoutineRunsChanged` |
| `composio` | `ComposioCliReady`, `ComposioCliFailed` |
| `scheduler` | `HeartbeatFired`, `CronFired` |
| `toast` | `Toast`, `CompletionToast` |
| `events` | `EventReceived`, `EventProcessed` |
| `auth` | `AuthRequired` |

## Auditing conformance

- `engine/houston-engine-server/tests/` — in-process HTTP + WS assertions.
- `ui/engine-client/src/types.ts` — mirrors the Rust DTOs by hand until a
  codegen tool (`ts-rs` or `specta`) is adopted. CI should fail if shapes
  drift.

## Integration gotchas (custom frontends)

These are load-bearing things every custom frontend must do. Missing
any of them doesn't break the build but will produce a frozen or
silently-wrong UI at runtime.

### Start the file watcher on mount

The Claude/Codex CLI writes files via its own tools — those writes
bypass the engine entirely. The engine only learns about them when
the filesystem watcher is running. Call
`POST /v1/watcher/start` (SDK: `client.startAgentWatcher(agentPath)`)
exactly once after you resolve the agent folder. Without it,
`FilesChanged` never fires for agent-side writes and the UI looks
frozen until a manual reload.

### Subscribe to WS topics before firing a session

The per-connection forwarder drops events that arrive before the
client has subscribed to their topic. Subscribe to `session:<key>`
and `agent:<path>` first, THEN `POST /v1/agents/:path/sessions`.
The echoed `session_key` in the start response is safe; early
events for that key may have been dropped — refetch with
`/v1/agents/:path/sessions/:key/history` if you need them.

### System prompts are caller-supplied

`POST /v1/agents/:path/sessions` accepts an optional `systemPrompt`
field. When omitted, the engine falls back to whatever the embedding
app passed in via `HOUSTON_APP_SYSTEM_PROMPT` at subprocess spawn. The
engine has no hardcoded product copy — it only assembles generic
per-agent context from disk (working directory, mode overrides,
skills index, integrations). Final prompt =
`<product_prompt>\n\n---\n\n<agent_context>`. Onboarding sessions use
`HOUSTON_APP_ONBOARDING_PROMPT` as an additional suffix.

The assembled prompt reaches the provider CLIs via **scratch files,
never argv** (`houston-terminal-manager::prompt_scratch`): codex gets a
per-session profile at `$CODEX_HOME/houston-tmp-*.config.toml` selected
with `-p` (requires the file-based profiles in codex ≥ 0.137 — keep the
`cli-deps.json` pin at or above that), claude gets a temp file via
`--system-prompt-file`. Argv tokens are capped at 32,767 chars total by
Windows `CreateProcessW`; carrying the prompt inline (`-c
developer_instructions=…` / `--system-prompt <text>`) broke every spawn
with os error 206 once an agent's accumulated context outgrew the limit.
Growth is also bounded at the source: `workspace_context` caps the
`WORKSPACE.md`/`USER.md` prompt share (12 KB / 4 KB, newest-first, with
an explicit omission marker) the same way `learnings_context` caps
learnings — files on disk are never trimmed.

### Feed-item streaming needs a reducer

`assistant_text_streaming` deltas should REPLACE the in-progress
assistant message in your state; `assistant_text` finalizes it.
Don't append every streaming delta as a new message row. Same
pattern for `thinking_streaming` / `thinking`. See
`examples/smartbooks/src/lib/feed.ts::appendFeedItem`.

### Context-usage lives on `final_result`

The terminal `feed_type: "final_result"` item carries `data: { result,
cost_usd, duration_ms, usage }`. `usage` is the normalized `TokenUsage`
`{ context_tokens, output_tokens, cached_tokens }` (Rust
`houston-terminal-manager::TokenUsage`, TS `@houston-ai/chat` `TokenUsage`)
or `null` for providers that don't report it (Anthropic + Codex do; Gemini
doesn't yet). `context_tokens` is the prompt size of the most recent model
request, i.e. how much of the context window is in use.

- **Anthropic:** the parser sums the last assistant message's three-way split
  (`input + cache_creation + cache_read`). The per-message usage IS the last
  request, so this is the live fill.
- **Codex:** trickier. `codex exec --json` only emits `turn.completed.usage`,
  which is the CUMULATIVE sum of every model request in the turn (a turn with
  N tool round-trips reports ~N× the real size — this is the
  94k-instead-of-19k bug). The real last-request fill + the effective window
  live ONLY in Codex's on-disk rollout
  (`$CODEX_HOME/sessions/**/rollout-*-<thread_id>.jsonl`, default
  `~/.codex`), in `token_count.info.last_token_usage` /
  `model_context_window`. So `engine codex_rollout::latest_usage(thread_id)`
  reads the newest rollout's last `token_count` and `session_io` patches it
  onto the `FinalResult` after the stream flushes (codex only writes the
  rollout fully on exit, so the held-back FinalResult is emitted post-loop).
  The parser leaves `usage` None; on any rollout failure it stays None (no %
  beats a wrong %). Bumping the bundled codex won't help — neither 0.130 nor
  0.135 `exec --json` exposes the per-request data in stdout.

The desktop composer's context-usage indicator (`app/src/components/context-
indicator.tsx`) divides the latest turn's `context_tokens` by a window
estimate to drive a ring gauge (a donut whose arc fills with the occupied
fraction and turns red near the limit; the percentage, a progress bar, and
rounded token counts surface on hover); it reads usage via `sessionContextUsage`
(`app/src/lib/context-usage.ts`) so it works both live and after a history
reload (the field is persisted in `chat_feed.data_json`). `/context` (the
interactive Claude Code slash command) is unavailable here because the
engine drives `claude -p` in non-interactive print mode — the data comes
from the stream's `usage` blocks, not a REPL command.

**The window is an estimate, by necessity.** The real context window is
plan/credit-gated and is NOT reported anywhere `claude -p` can see (verified
against Claude Code 2.1.159: `system init` carries only `model`, `tools`,
`mcp_servers`, ... — no window field; no flag; no env var; Codex's
`thread.started` likewise). The gating:

- Opus 4.x → 1M automatic on Max/Team/Enterprise, else 200k (1M needs
  `/extra-usage` credits on Pro).
- Sonnet 4.6 → 200k on every plan; 1M only with usage credits.
- Codex gpt-5.5 → **258,400** effective = raw `context_window` 272k ×
  `effective_context_window_percent` 95% (both from Codex's `models_cache.json`,
  and the rollout's `model_context_window` confirms 258400). The opt-in 1M
  variant maxes at 1M × 95% = 950k.

So the indicator uses a **self-correcting estimate** (`providers.ts`
`contextWindow` = default assumption, `contextWindowMax` = snap-up ceiling;
`context-usage.ts` `effectiveContextWindow`): start from the per-model
default (Opus 1M, Sonnet 200k, gpt-5.5 258.4k), then snap UP to the ceiling
once the session's observed PEAK `context_tokens` exceeds the default —
which proves the real window is larger, because both CLIs auto-compact
before the limit so observed usage can never exceed the true window. This
auto-fixes Sonnet-with-credits and never reads over 100%. The one case it
over-estimates is Opus on Pro WITHOUT credits (shows 1M, really 200k); it
can't self-correct downward, so the dialog labels the figure "estimated".
If a future CLI release exposes the window in `system init` /
`thread.started`, prefer that live value over the estimate.

### Autocompact (`context_compacted`)

When a conversation nears the context window, Houston frees space without
touching the user's visible chat. Both paths surface as one
`feed_type: "context_compacted"` item (`data: { trigger: "native" |
"proactive", pre_tokens?: number }`, Rust `FeedItem::ContextCompacted`),
rendered as a subtle divider — the full history above and below stays visible.

- **Native** — Claude Code auto-compacts its own transcript as it nears the
  window (~95%) and emits a top-level stream-json `system` event
  `{"subtype":"compact_boundary","compact_metadata":{"trigger","pre_tokens",…}}`
  (verified against Claude Code 2.1.160). `parser.rs` lifts it into
  `ContextCompacted { trigger: Native }`. Claude-only today: Codex's `exec`
  auto-compaction is unreliable, which is exactly why the forced path exists.
- **Proactive** — the desktop client watches the context-usage % and, once it
  crosses the threshold (default 93%, overridable at build time via
  `VITE_AUTOCOMPACT_THRESHOLD`), sets `compact: true` on the next
  `startSession`. The engine
  (`sessions::compaction`) summarizes the visible chat via a one-shot provider
  call, abandons the current resume id with
  `SessionIdHandle::clear_current_preserving_history()` (the id stays in
  `.history` so `session_ids_for_history` still loads the full `chat_feed`),
  emits + persists a `Proactive` marker under the old id, then runs the turn on
  a FRESH provider session seeded with `[summary + the user's message]`. The
  persisted/displayed user message stays the original; only the agent's working
  context shrank. Provider-agnostic — the reliable path for Codex.

Autocompact is always on — there is no user-facing toggle. It's a
non-destructive guarantee (the full `chat_feed` stays visible regardless), so
the decision is purely client-side: `lib/autocompact.ts`, called from
`tauriChat.send` so every send path gets it, reads the live feed usage
synchronously. The only knob is the threshold, a build-time constant
(`VITE_AUTOCOMPACT_THRESHOLD`, default 93), not a user setting.
`compact` is honored only when a resume id exists (ignored on turn 1). On
summary failure the engine logs and falls back to a normal resume (the CLI's own
auto-compaction is the backstop), so a turn never fails because compaction
couldn't run.

### Provider switch (`provider_switched`)

`POST .../sessions` accepts an optional `providerSwitch: { mode: "replay" |
"summarize", fromProvider }` (HOU-424). It is set by the client when the user
moves a live conversation to a DIFFERENT provider mid-stream. Provider CLI
sessions aren't portable, so the engine reseeds a FRESH session on the resolved
(new) provider with prior context — the full transcript verbatim (`replay`) or
an AI summary (`summarize`) — and clears any current resume id for the resolved
provider so a switch-back never resumes a stale cross-provider session. It takes
precedence over `compact`. The seed is built from the DB `chat_feed`, and the
summary (for `summarize`) runs on the TARGET provider, so a switch away from an
out-of-credits provider still works. Unlike `compact`, a switch seed failure is
NOT swallowed: it surfaces as a `SessionStatus` error (beta no-silent-failure
policy).

The boundary is recorded as a `feed_type: "provider_switched"` item (`data: {
provider, summarized, pre_tokens? }`, Rust `FeedItem::ProviderSwitched`),
rendered as a subtle divider like `context_compacted`. `provider` is the
provider switched TO; `summarized` distinguishes the verbatim carry from the
summarized one. The full `chat_feed` above and below stays visible.

### Binary file downloads

The `read-project` route returns text only. For xlsx, pdf, images,
etc., call `POST /v1/shell` with `open "<path>"` (macOS),
`xdg-open "<path>"` (Linux), or `start "" "<path>"` (Windows) to
hand the file to the host OS's default application. A first-class
binary-read endpoint is on the roadmap — until it lands, the shell
route is the escape hatch.

### Bearer token placement for WebSocket

Browsers can't set `Authorization` on WebSocket upgrades. Use
`?token=<token>` on the WS URL instead. The engine accepts all three
(`Authorization` header, `?token=`, `Sec-WebSocket-Protocol:
houston-bearer.<token>`).

### Reference implementation

[`examples/smartbooks/`](../examples/smartbooks/) — a complete custom
frontend consumer of the engine, ~400 lines of TSX, zero `@houston-ai/*`
UI deps. Treat as a copy-paste template.
