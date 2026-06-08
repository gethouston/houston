# Houston Engine API (for the webapp)

The engine is a single-workspace, single-user HTTP server. The webapp talks to it
over **REST for commands + SSE for live conversation events**. The typed contract +
client live in **`@houston/engine-client`** — prefer that over hand-rolling fetch.

- Base URL (local dev): `http://127.0.0.1:4317`
- Content type: `application/json` unless noted.
- **Protocol version:** `2` (see `GET /version`).

## Auth

- If the engine is started with `HOUSTON_ENGINE_TOKEN`, send `Authorization: Bearer <token>`
  on every request (the SSE stream also accepts `?token=<token>`).
- If unset (local dev on loopback), the API is open.
- `GET /health` and `GET /version` are always public.

## CORS

Enabled for the webapp's origin. Default `Access-Control-Allow-Origin: *` (safe —
auth is a bearer token, not a cookie). Lock down with `HOUSTON_CORS_ORIGIN=https://app.example.com`.
`OPTIONS` preflight is handled; allowed headers: `Authorization, Content-Type`.

## Endpoints

`:provider` is `anthropic` (Claude Pro/Max) or `openai-codex` (ChatGPT/Codex).

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/health` | — | `{ status: "ok", version }` |
| GET | `/version` | — | `{ engine, protocol }` |
| GET | `/providers` | — | `ProviderInfo[]` (id, name, configured, isActive, activeModel, models) |
| PUT | `/settings` | `{ activeProvider?, model? }` | `Settings` |
| GET | `/auth/status` | — | `AuthStatus` (per-provider) |
| POST | `/auth/:provider/login` | — | `LoginInfo` — `{kind:"url",url}` (local Claude, loopback), `{kind:"auth_code",url,instructions?}` (headless Claude), or `{kind:"device_code",verificationUri,userCode}` (Codex) |
| POST | `/auth/:provider/login/complete` | `{ code }` | `{ ok }` — submit the pasted code (the `auth_code` headless Claude path) |
| POST | `/auth/:provider/logout` | — | `{ ok }` |
| GET | `/conversations` | — | `ConversationSummary[]` (newest first) |
| GET | `/conversations/:id/messages` | — | `ConversationHistory` (404 if unknown) |
| GET | `/conversations/:id/events` | — | **SSE stream** of `WireEvent` for this conversation only |
| POST | `/conversations/:id/messages` | `{ text, nonce? }` | `202 { ok, id }` — starts a turn; events arrive on the events stream |
| POST | `/conversations/:id/cancel` | — | `{ ok }` — abort the in-flight turn |

`:id` is any client-chosen conversation id (use a uuid — `crypto.randomUUID()`).
A conversation is materialized on its first message; there is no explicit create.

### Conversation isolation

Each conversation is fully isolated. Subscribing to `/conversations/:id/events`
opens a stream scoped to **exactly that id** — no event from another conversation
can ever arrive on it (the engine partitions subscribers per conversation; there is
no global firehose). Sending a message and observing a conversation are decoupled:
`POST …/messages` only *triggers* the turn, and **all** events — including the user
message echo — are delivered on the events stream. This means a conversation can be
observed from multiple clients/tabs and survives a dropped connection (reconnect and
the `sync` frame catches you up mid-turn).

### Login flow (subscription OAuth)

1. `POST /auth/:provider/login` → a `LoginInfo`. Which Claude variant you get is
   decided by the engine's deploy mode (`HOUSTON_HEADLESS`, else inferred from a
   non-loopback bind host):
   - **Claude, local** → `{ kind: "url", url }`. Open `url`; the engine catches the
     redirect on its own loopback (`localhost:53692`). Nothing else to do.
   - **Claude, headless** → `{ kind: "auth_code", url, instructions? }`. Open `url`,
     approve, then the user copies the `code#state` Claude shows and submits it →
     `POST /auth/anthropic/login/complete { code }`. No loopback needed — the same
     flow Claude Code itself uses for browserless sign-in.
   - **Codex (`openai-codex`)** → `{ kind: "device_code", verificationUri, userCode }`.
     Show both; the user opens `verificationUri` and enters `userCode` (fully
     headless — the engine polls, no paste step).
2. Poll `GET /auth/status` until that provider's `configured: true`. Tokens are
   stored and auto-refreshed by the engine.
3. Pick the chat model with `PUT /settings { activeProvider, model }` (optional —
   sensible defaults apply). `GET /providers` lists available models per provider.

### Live events (SSE)

`GET /conversations/:id/events` returns `text/event-stream`. Each frame is
`data: <WireEvent JSON>\n\n`. On connect the engine sends a `sync` frame, then
live-tails the turn:

```
data: {"type":"sync","data":{"running":true,"partial":"Hel"}}
data: {"type":"text","data":"lo"}
data: {"type":"tool_start","data":{"name":"ls","args":{"path":"."}}}
data: {"type":"tool_end","data":{"name":"ls","isError":false}}
data: {"type":"done","data":null}
```

`WireEvent` types: `sync` | `user` | `text` | `thinking` | `tool_start` | `tool_end`
| `done` | `error`.

- `sync` — once on connect: `{ running, partial }` (is a turn live + assistant text so far).
- `user` — a user message was added (by any client). `{ content, ts, nonce? }`; the
  `nonce` echoes the sender's so it can skip rendering its own message twice.
- `done` / `error` — the turn ended. The stream stays open for the next turn.

This is a GET, so you can use `EventSource` directly (the client uses `fetch` +
a reader so it can send a bearer header).

## Using the client (recommended)

```ts
import { HoustonEngineClient } from "@houston/engine-client";

const engine = new HoustonEngineClient({
  baseUrl: import.meta.env.VITE_ENGINE_URL ?? "http://127.0.0.1:4317",
  // token: import.meta.env.VITE_ENGINE_TOKEN,   // only if the engine sets one
});

// 1) Connect a provider (Claude or Codex)
const info = await engine.startLogin("anthropic"); // or "openai-codex"
if (info.kind === "url") {
  window.open(info.url, "_blank"); // local Claude: engine catches the loopback
} else if (info.kind === "auth_code") {
  window.open(info.url, "_blank"); // headless Claude: then collect the pasted code
  const code = await promptForCode(info.instructions);
  await engine.completeLogin("anthropic", code);
} else {
  showDeviceCode(info.verificationUri, info.userCode); // Codex
}
// poll engine.authStatus(): providers[].configured / activeProvider
// optional: await engine.setSettings({ activeProvider: "anthropic", model: "claude-opus-4-5" });

// 2) Open ONE conversation's isolated event stream, then send into it
const id = crypto.randomUUID();
const ac = new AbortController();
engine.streamEvents(id, {
  signal: ac.signal,
  onEvent: (ev) => {
    if (ev.type === "sync") setBusy(ev.data.running);
    else if (ev.type === "user") showUser(ev.data.content);
    else if (ev.type === "text") appendAssistantText(ev.data);
    else if (ev.type === "tool_start") showTool(ev.data.name);
    else if (ev.type === "error") showError(ev.data.message);
    else if (ev.type === "done") setBusy(false);
  },
});
await engine.sendMessage(id, "List the files here"); // returns 202; events arrive above
// ac.abort() to stop observing; the turn keeps running server-side.

// 3) History / list / cancel
const convos = await engine.listConversations();
const history = await engine.getHistory(id);
await engine.cancel(id); // stop the turn server-side
```

All request/response shapes are exported types from `@houston/engine-client`
(`AuthStatus`, `ConversationSummary`, `ConversationHistory`, `ChatMessage`,
`WireEvent`, …) — import them for your component props.

## Consuming the client package

`@houston/engine-client` is a pnpm workspace package (zero runtime deps). From the
webapp:

```bash
pnpm add @houston/engine-client@workspace:*
pnpm --filter @houston/engine-client build   # emits dist/ (one-time / on change)
```

Types resolve from source; the runtime entry is `dist/index.js`.
