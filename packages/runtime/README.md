# @houston/engine (TypeScript)

The new Houston engine — a single-workspace, single-user agent runtime built on
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

The engine is API-only (REST + SSE) with no built-in UI. Drive it with the webapp
(`pnpm --filter houston-web dev`) or the typed client
([`@houston/runtime-client`](../runtime-client)), both pointed at
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
| `HOUSTON_MODEL` | `claude-sonnet-4-6` | Anthropic model id (optional; built-in default) |
| `HOUSTON_RUNTIME_TOKEN` | _(unset)_ | Bearer token; unset = open (local dev) |
| `HOUSTON_HEADLESS` | _(inferred)_ | Force the headless Claude login (copy-paste code, no loopback). Inferred from a non-loopback `HOUSTON_HOST`; set `1` to force it, `0` to force loopback |
| `HOUSTON_CORS_ORIGIN` | `*` | Allowed CORS origin for the webapp |

## Deploy (Docker / VPS)

A `Dockerfile` + `docker-compose.yml` live in this directory. The image runs the
engine on Bun (`oven/bun`), with `git` + `python3` available for the agent's
shell tools.

```bash
cd packages/runtime
cp .env.example .env                 # set HOUSTON_RUNTIME_TOKEN (openssl rand -hex 32)
docker compose up -d --build
docker compose logs -f
```

The agent's working directory is the `houston-workspace` volume (`/workspace`);
swap it for a bind mount in `docker-compose.yml` to point at a real project.
Auth + transcripts persist in the `houston-data` volume (`/data`). The container
runs as the non-root `bun` user (uid 1000) — named volumes inherit that
ownership automatically, but a bind mount keeps its host ownership, so make it
writable by uid 1000 first (e.g. `chown -R 1000:1000 /srv/my-project`).

**Build context note.** The build context is the parent `packages/` directory,
not `packages/runtime` — the engine links its sibling `@houston/runtime-client`
via `file:../runtime-client`. Compose handles this; for a raw build run it from
the repo root:

```bash
docker build -f packages/runtime/Dockerfile -t houston/ts-engine ./packages
```

**Security (read before exposing it).** With no token the engine is fully open,
and a caller can make the agent run shell commands in the workspace and spend
your Claude subscription. On a VPS:

- **Always set `HOUSTON_RUNTIME_TOKEN`** (compose refuses to start without it).
  Pass it as `Authorization: Bearer <token>`.
- The container is the trust boundary for the agent's `bash` tool — don't
  bind-mount sensitive host paths as the workspace.
- Put a TLS-terminating reverse proxy (Caddy, nginx) in front; the engine speaks
  plain HTTP. For the streaming endpoint (`POST /conversations/:id/messages`),
  **disable response buffering** so SSE flushes (nginx: `proxy_buffering off;`).
  Caddy streams correctly by default — a `reverse_proxy 127.0.0.1:4317` is
  enough.

**Logging in on a VPS.** A non-loopback `HOUSTON_HOST` auto-enables the headless
copy-paste login (see "Headless login" above), since a remote browser can't reach
the engine's `127.0.0.1:53692` loopback. **Claude** → start login, authorize in
your browser, then paste the code back (`POST /auth/anthropic/login/complete`);
**Codex** → device code (`POST /auth/openai-codex/login`, enter the code on your
own device).

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
client: **[`@houston/runtime-client`](../runtime-client)**; full spec:
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
