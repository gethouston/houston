# Houston Always On

Self-host the Houston Engine on your own server. Your agents keep running
while your laptop is closed. Your desktop and mobile clients connect over
the same HTTP + WebSocket protocol they use locally — the only thing that
changes is the `baseUrl`.

## Prerequisites

- Linux host, 1 vCPU / 512 MB RAM minimum.
- Docker 24+ (or `cargo` if you prefer a native build).
- A long random bearer token (`openssl rand -hex 32`).

## Quick start (Docker)

```bash
cd always-on/
cp .env.example .env
$EDITOR .env   # fill in HOUSTON_ENGINE_TOKEN
docker compose up -d
curl -H "Authorization: Bearer $TOKEN" http://localhost:7777/v1/health
```

You should see:

```json
{"status":"ok","version":"0.4.0","protocol":1}
```

## Reverse proxy (recommended)

Terminate TLS at your proxy (`caddy`, `nginx`, `traefik`…) and forward
`/v1/*` and `/v1/ws` to `127.0.0.1:7777`. Example Caddyfile:

```
houston.example.com {
    reverse_proxy 127.0.0.1:7777
}
```

WebSocket upgrade headers are forwarded by default in modern proxies.

## Connect the desktop app

In Houston → Settings → Connect to remote engine, paste:

- URL: `https://houston.example.com`
- Token: `$HOUSTON_ENGINE_TOKEN`

Local OS-native features (reveal in file manager, file pickers) stay disabled
when you're connected to a remote engine.

## Environment

| Var | Default | Purpose |
|---|---|---|
| `HOUSTON_BIND` | `127.0.0.1:0` | `ip:port` to bind. Set to `0.0.0.0:7777` for remote. |
| `HOUSTON_BIND_ALL` | unset | Must be `1` to allow binding `0.0.0.0`. |
| `HOUSTON_ENGINE_TOKEN` | auto-generated | Bearer token clients must send. |
| `HOUSTON_HOME` | `~/.houston` | Data dir (DB, `engine.json`, workspaces). |
| `HOUSTON_DOCS` | `$HOUSTON_HOME/workspaces` | Workspaces root. |
| `HOUSTON_NO_PARENT_WATCHDOG` | unset | Set to `1` to disable the stdin-EOF parent watchdog. Required for non-interactive standalone runs (systemd/docker) where stdin is `/dev/null` — already set in the unit and compose files here. |
| `RUST_LOG` | `info,houston=debug` | tracing filter. |

## Native build (no Docker)

```bash
cargo build --release -p houston-engine-server --bin houston-engine
HOUSTON_BIND=0.0.0.0:7777 HOUSTON_BIND_ALL=1 \
  HOUSTON_ENGINE_TOKEN=$TOKEN \
  ./target/release/houston-engine
```

A systemd unit template lives at `always-on/houston-engine.service`.

## Updating

The engine exposes its version at `GET /v1/version`. When we release a new
major-minor, the `X-Houston-Engine-Version` header bumps; desktop clients
refuse to talk to an engine with a higher protocol major. Pull, rebuild,
restart.

## Status

Ships with Phase 5 of the engine rollout. Phases 1-4 track the path from
"Tauri-only backend" to "standalone binary" — see
`knowledge-base/engine-server.md`.
