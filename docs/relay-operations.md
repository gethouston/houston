# Relay operations

The Houston relay (`houston-relay/`) is a single Cloudflare Worker + Durable Object that brokers mobile ↔ desktop traffic and serves the mobile PWA bundle from the same origin. This doc covers deployment, secret management, and health checks.

## Deploying

Staging:
```
cd mobile && bun run build
cd ../houston-relay && bunx wrangler deploy --env staging
# → tunnel-staging.gethouston.ai
```

Production:
```
cd mobile && bun run build
cd ../houston-relay && bunx wrangler deploy
# → tunnel.gethouston.ai
```

Production uses the top-level env; `--env ""` is the explicit form when switching between envs in the same session. `workers_dev = false` is set so the free `*.workers.dev` subdomain is disabled — all traffic enters through the custom domain.

Because the PWA is served via the Worker's `[assets]` binding pointing at `../mobile/dist`, you MUST build mobile before deploy. A CI job should chain the two.

## DNS

Both `tunnel.gethouston.ai` and `tunnel-staging.gethouston.ai` are registered as Cloudflare Custom Domains (`custom_domain = true` in `wrangler.toml`). Wrangler auto-provisions the proxied DNS record and certificate. First deploy of a new environment may take ~60s for DNS propagation.

## Required secrets

Only one:

```
wrangler secret put TUNNEL_SHARED_SECRET  # 32+ random bytes
```

Used to derive per-tunnel HMAC tokens on `/allocate` and verify them on `/e/:tunnelId/register`. Rotating is destructive (every cached `tunnel.json` on every Mac becomes invalid, forcing re-allocation). Only rotate if the secret is compromised.

## Health checks

- `GET /health` → `{ok: true}` if the Worker is up.
- `GET /` → serves the PWA `index.html` (200, `text/html`).
- `POST /allocate` with no body → `{tunnelId, tunnelToken, publicHost}` (200, JSON).
- `GET /pair/test-000000` → 302 to `/?code=test-000000` (confirms QR deep-link path works).

## Durable Object state

Each paired desktop maps to one `TunnelRoom` DO, keyed by `tunnelId`. The DO holds:
- One outbound WS FROM the desktop (`this.desktop`).
- Zero-or-more mobile WS legs (`mobileSockets`).
- In-flight pending HTTP reqs (capped at 64 per tunnel).

Watch `/e/:tunnelId/status` for a quick health view: `{connected, inflight, mobileSockets, lastDesktopActivity}`.

## Phone-access abuse mitigation

- The QR contains a high-entropy access secret, not a 6-digit code. It is reusable so a phone can reconnect after laptop sleep, shutdown, app restart, or a closed browser tab.
- Each scan exchanges the QR secret for a separate device-scoped bearer. The QR secret is not sent on normal API requests.
- Settings exposes one recovery control: Disconnect all phones. It rotates the QR secret and marks every live `engine_tokens` row `revoked_at = now()`.

## Park-scenario canary (weekly manual)

1. Mac awake at home, engine running, tunnel shows `connected: true` in Connect phone.
2. Phone on cellular (different network) — scan QR, pair succeeds.
3. Start a mission from phone → reaches desktop, streams response.
4. Send a message from phone; activity appears on desktop "Running" within ~1s.
5. Agent finishes; desktop activity flips to "Needs You"; phone chat header stops showing "typing…".
6. Close phone tab + reopen → no re-pair needed, sessions intact.
7. Sleep the Mac (lid close). Phone sees requests fail with 503. Wake Mac; tunnel reconnects within ~30s; phone refetches automatically on reconnect.
8. Restart the Mac and reopen Houston. Phone works with the existing localStorage token once the tunnel reconnects.
9. Settings → Disconnect all phones. Existing phone requests 401; scanning the new QR pairs again.

Failure in any step blocks release.

## Observability

- Live logs: `wrangler tail` streams every Worker invocation.
- Metrics: Cloudflare dashboard → Workers → `houston-relay` → Analytics.
- Durable Object requests: same dashboard, DO tab.

## Local development

Point the engine at a local relay instead of production:

```
cd houston-relay && bunx wrangler dev    # → http://localhost:8787
cd ../app && HOUSTON_TUNNEL_URL=http://localhost:8787 bun run tauri dev
```

The engine auto-switches WS scheme from `wss://` to `ws://` when `HOUSTON_TUNNEL_URL` uses `http://`.
