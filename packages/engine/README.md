# @houston/engine (TypeScript)

The new Houston engine — a single-workspace, single-user agent runtime built on
[`pi-coding-agent`](https://github.com/earendil-works/pi). It owns the agent loop
in-process (no provider CLIs) and talks to providers directly via `pi-ai`.

**MVP status:** log in with your Claude Code (Anthropic) subscription via OAuth,
then chat with the agent. Streaming over SSE. Node-native; runs on Bun.

## Run it

```bash
cd packages/engine
bun install            # first time only

# Point it at a working directory the agent may read/edit, then start:
HOUSTON_WORKSPACE_DIR="$HOME/some/project" bun run dev
```

The engine is API-only (REST + SSE) with no built-in UI. Drive it with the webapp
(`pnpm --filter houston-web dev`) or the typed client
([`@houston/engine-client`](../engine-client)), both pointed at
`http://127.0.0.1:4317`. To wire up a login from scratch:

1. `POST /auth/anthropic/login` → returns a Claude login URL; open it.
2. Authorize with your Claude Pro/Max subscription. The engine catches the
   callback on `localhost:53692` and stores the token (auto-refreshed); poll
   `GET /auth/status` until `configured: true`. (Headless engines use a
   copy-paste code instead — see below.)
3. `POST /conversations/:id/messages` and stream the agent's reply (and tool
   calls like `read`/`ls`/`bash`) from `GET /conversations/:id/events`.

### Headless login (no loopback)

When the browser can't reach the engine's loopback, Claude login switches to a
copy-paste code flow (the same one Claude Code uses for browserless sign-in): the
engine returns a `{ kind: "auth_code" }` login, the webapp opens the URL, and the
user pastes the code Claude shows back via `POST /auth/anthropic/login/complete`.
Auto-selected from a non-loopback `HOUSTON_HOST`; force it with `HOUSTON_HEADLESS=1`.
Codex is headless either way (device code). See `src/auth/anthropic-headless.ts`.

## Config (env)

| Var | Default | Meaning |
|-----|---------|---------|
| `HOUSTON_WORKSPACE_DIR` | `cwd` | Directory the agent operates in |
| `HOUSTON_DATA_DIR` | `~/.houston-ts/data` | `auth.json` + conversation JSONL |
| `HOUSTON_HOST` / `HOUSTON_PORT` | `127.0.0.1` / `4317` | Bind address |
| `HOUSTON_MODEL` | `claude-sonnet-4-5` | Anthropic model id |
| `HOUSTON_ENGINE_TOKEN` | _(unset)_ | Bearer token; unset = open (local dev) |
| `HOUSTON_HEADLESS` | _(inferred)_ | Force the headless Claude login (copy-paste code, no loopback). Inferred from a non-loopback `HOUSTON_HOST`; set `1` to force it, `0` to force loopback |

## Layout

```
spike/phase0.ts          Phase 0 de-risk spike (faux turn + OAuth probe)
src/config.ts            env config (incl. headless detection)
src/auth/storage.ts      AuthStorage + ModelRegistry (persisted)
src/auth/login.ts        multi-provider login orchestration (url / auth_code / device_code)
src/auth/anthropic-headless.ts   headless Claude OAuth (console redirect + paste code)
src/ai / src/session     headless ResourceLoader, createAgentSession, turn runner
src/transport/server.ts  node:http router (REST + SSE)
src/main.ts              bootstrap
```

## Webapp integration

The engine exposes a REST + SSE API for the standalone webapp. Contract + typed
client: **[`@houston/engine-client`](../engine-client)**; full spec:
**[`docs/engine-api.md`](docs/engine-api.md)**.

Endpoints: `GET /health`, `GET /version`, `GET /providers`, `PUT /settings`,
`GET /auth/status`, `POST /auth/:provider/login` · `/login/complete` · `/logout`
(`:provider` = `anthropic` | `openai-codex`), `GET /conversations`,
`GET|POST /conversations/:id/messages` (POST streams SSE),
`POST /conversations/:id/cancel`. CORS is enabled (`HOUSTON_CORS_ORIGIN`, default `*`).

Both subscription logins work: **Claude** (`anthropic` — loopback locally, copy-paste
`auth_code` when headless) and **Codex** (`openai-codex`, device code). Pick the chat
model via `PUT /settings`.

## Not yet built (next)

In-process permission gating for tools, context-resume across engine restarts,
conversation management (rename/delete). (API-key auth intentionally dropped —
OAuth only.) See the plan file.
