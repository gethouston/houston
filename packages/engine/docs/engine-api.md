# Houston Engine API (for the webapp)

The engine is a single-workspace, single-user HTTP server. The webapp talks to it
over **REST for commands + SSE for the streaming chat**. The typed contract +
client live in **`@houston/engine-client`** — prefer that over hand-rolling fetch.

- Base URL (local dev): `http://127.0.0.1:4317`
- Content type: `application/json` unless noted.
- **Protocol version:** `1` (see `GET /version`).

## Auth

- If the engine is started with `HOUSTON_ENGINE_TOKEN`, send `Authorization: Bearer <token>`
  on every request (the SSE stream also accepts `?token=<token>`).
- If unset (local dev on loopback), the API is open.
- `GET /` and `GET /health` are always public.

## CORS

Enabled for the webapp's origin. Default `Access-Control-Allow-Origin: *` (safe —
auth is a bearer token, not a cookie). Lock down with `HOUSTON_CORS_ORIGIN=https://app.example.com`.
`OPTIONS` preflight is handled; allowed headers: `Authorization, Content-Type`.

## Endpoints

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/health` | — | `{ status: "ok", version }` |
| GET | `/version` | — | `{ engine, protocol }` |
| GET | `/auth/status` | — | `AuthStatus` |
| POST | `/auth/anthropic/login` | — | `{ url }` — open in a browser |
| POST | `/auth/anthropic/login/complete` | `{ code }` | `{ ok }` — paste-code (remote hosts) |
| POST | `/auth/anthropic/logout` | — | `{ ok }` |
| GET | `/conversations` | — | `ConversationSummary[]` (newest first) |
| GET | `/conversations/:id/messages` | — | `ConversationHistory` (404 if unknown) |
| POST | `/conversations/:id/messages` | `{ text }` | **SSE stream** of `WireEvent` |
| POST | `/conversations/:id/cancel` | — | `{ ok }` — abort the in-flight turn |

`:id` is any client-chosen conversation id (e.g. `"main"`, a uuid). Sending a
message to a new id creates the conversation.

### Login flow (Claude Code / Anthropic subscription)

1. `POST /auth/anthropic/login` → `{ url }`. Open `url` in the browser.
2. The user authorizes with their Claude Pro/Max plan.
   - **Local engine:** the redirect hits the engine's loopback (`localhost:53692`)
     automatically — nothing else to do.
   - **Remote engine:** the loopback is unreachable, so the user copies the code
     from the redirect and you `POST /auth/anthropic/login/complete { code }`.
3. Poll `GET /auth/status` until `anthropicConfigured: true`. Tokens are stored
   and auto-refreshed by the engine.

### Streaming a turn (SSE)

`POST /conversations/:id/messages` with `{ text }` returns `text/event-stream`.
Each frame is `data: <WireEvent JSON>\n\n`:

```
data: {"type":"text","data":"Hello"}
data: {"type":"text","data":", world"}
data: {"type":"tool_start","data":{"name":"ls","args":{"path":"."}}}
data: {"type":"tool_end","data":{"name":"ls","isError":false}}
data: {"type":"done","data":null}
```

`WireEvent` types: `text` | `thinking` | `tool_start` | `tool_end` | `done` | `error`.
The stream ends after `done` (success) or `error`. Note: this is a POST, so use
`fetch` + a stream reader (the client does this) rather than `EventSource`.

## Using the client (recommended)

```ts
import { HoustonEngineClient } from "@houston/engine-client";

const engine = new HoustonEngineClient({
  baseUrl: import.meta.env.VITE_ENGINE_URL ?? "http://127.0.0.1:4317",
  // token: import.meta.env.VITE_ENGINE_TOKEN,   // only if the engine sets one
});

// 1) Connect Claude
if (!(await engine.authStatus()).anthropicConfigured) {
  const { url } = await engine.startAnthropicLogin();
  window.open(url, "_blank");
  // poll engine.authStatus() until .anthropicConfigured
}

// 2) Chat (streaming)
for await (const ev of engine.streamMessage("main", "List the files here")) {
  if (ev.type === "text") appendAssistantText(ev.data);
  else if (ev.type === "tool_start") showTool(ev.data.name);
  else if (ev.type === "error") showError(ev.data.message);
}

// 3) History / list / cancel
const convos = await engine.listConversations();
const history = await engine.getHistory("main");
const ac = new AbortController();
engine.sendMessage("main", "…", onEvent, ac.signal); // ac.abort() to stop client-side
await engine.cancel("main");                          // stop the turn server-side
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
