# @houston/runtime (TypeScript)

The new Houston runtime — a single-workspace, single-user agent runtime built on
[`pi-coding-agent`](https://github.com/earendil-works/pi). It owns the agent loop
in-process (no provider CLIs) and talks to providers directly via `pi-ai`.

**MVP status:** log in with your Claude Code (Anthropic) subscription via OAuth,
then chat with the agent. Streaming over SSE. Node-native; runs on Bun.

## Run it

```bash
cd packages/runtime
bun install            # first time only

# Point it at a working directory the agent may read/edit, then start:
HOUSTON_WORKSPACE_DIR="$HOME/some/project" bun run dev
```

Then open **http://127.0.0.1:4317**:

1. Click **Connect Claude** → a Claude login tab opens.
2. Authorize with your Claude Pro/Max subscription. The runtime catches the
   callback on `localhost:53692` and stores the token (auto-refreshed).
3. Type a message and watch the agent stream its reply (and run tools like
   `read`/`ls`/`bash` in the workspace).

## Config (env)

| Var | Default | Meaning |
|-----|---------|---------|
| `HOUSTON_WORKSPACE_DIR` | `cwd` | Directory the agent operates in |
| `HOUSTON_DATA_DIR` | `~/.houston-ts/data` | `auth.json` + conversation JSONL |
| `HOUSTON_HOST` / `HOUSTON_PORT` | `127.0.0.1` / `4317` | Bind address |
| `HOUSTON_MODEL` | `claude-sonnet-4-5` | Anthropic model id |
| `HOUSTON_RUNTIME_TOKEN` | _(unset)_ | Bearer token; unset = open (local dev) |

## Layout

```
spike/phase0.ts          Phase 0 de-risk spike (faux turn + OAuth probe)
src/config.ts            env config
src/auth/storage.ts      AuthStorage + ModelRegistry (persisted)
src/auth/anthropic-login.ts   Claude OAuth flow (loopback + paste-code)
src/ai / src/session     headless ResourceLoader, createAgentSession, turn runner
src/transport/server.ts  node:http router (REST + SSE) + static test page
src/web/index.html       minimal browser test client
src/main.ts              bootstrap
```

## Webapp integration

The runtime exposes a REST + SSE API for the standalone webapp. Contract + typed
client: **[`@houston/runtime-client`](../runtime-client)**; full spec:
**[`docs/runtime-api.md`](docs/runtime-api.md)**.

Endpoints: `GET /health`, `GET /version`, `GET /providers`, `PUT /settings`,
`GET /auth/status`, `POST /auth/:provider/login` · `/login/complete` · `/logout`
(`:provider` = `anthropic` | `openai-codex`), `GET /conversations`,
`GET|POST /conversations/:id/messages` (POST streams SSE),
`POST /conversations/:id/cancel`. CORS is enabled (`HOUSTON_CORS_ORIGIN`, default `*`).

Both subscription logins work: **Claude** (`anthropic`, loopback + paste-code) and
**Codex** (`openai-codex`, device code). Pick the chat model via `PUT /settings`.

## Not yet built (next)

In-process permission gating for tools, context-resume across runtime restarts,
the Anthropic paste-code cloud flow verified end-to-end, conversation
management (rename/delete). (API-key auth intentionally dropped — OAuth only.)
See the plan file.
