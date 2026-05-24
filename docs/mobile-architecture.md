# Mobile architecture

Houston's mobile companion is a **web app** served from `tunnel.gethouston.ai` — the same Cloudflare Worker that brokers mobile ↔ desktop traffic also hosts the PWA bundle. One origin, one deployment, first-party cookies + WebSockets. A **native shell (Capacitor)** is being introduced to add push + App Store presence; it wraps this same web bundle (see the [Native shell](#native-shell-capacitor) section below and `docs/specs/2026-05-23-houston-mobile-capacitor.html`).

```
┌──────────────┐        ┌────────────────────────┐        ┌──────────────────┐
│  Phone       │        │  Relay Worker          │        │  User's Mac      │
│  Safari      │◄──────►│  tunnel.gethouston.ai  │◄──────►│  houston-engine  │
│  (PWA)       │  HTTPS │  ┌─ index.ts           │  WSS   │  (loopback only) │
│              │        │  ├─ tunnel-do.ts (DO)  │        │  houston-tunnel  │
│              │        │  └─ assets: PWA bundle │        │  dials outbound  │
└──────────────┘        └────────────────────────┘        └──────────────────┘
```

The Mac never opens an inbound port. The engine's `houston-tunnel` client dials outbound to the Worker's Durable Object. Mobile HTTP + WS requests multiplex over that single link.

## First-boot bootstrap

1. Desktop engine starts, calls `POST tunnel.gethouston.ai/allocate`.
2. Relay returns `{tunnelId, tunnelToken, publicHost}`; engine caches in `<home>/tunnel.json`.
3. Subsequent boots reuse the cached identity.
4. If the first boot has no network, pairing stays dormant; the engine still runs local-only. Next boot retries.

Override the relay URL for local development via `HOUSTON_TUNNEL_URL` (e.g. pointing at `wrangler dev`).

## Phone Access (Reusable QR)

1. User opens desktop → Connect phone. Desktop `POST /v1/tunnel/pairing` returns the current durable code `"<tunnelId>-<accessSecret>"` + a QR of `https://tunnel.gethouston.ai/pair/<code>`.
2. User scans the QR on their phone. Safari opens the URL; the relay's `GET /pair/:code` 302s to `/?code=<code>` on the same origin so the bundled SPA's `PairScreen` picks the code up.
3. PWA `POST tunnel.gethouston.ai/pair/<code>` → relay forwards the access secret as a `pair_request` frame over the tunnel WS → desktop engine's `MobileAccessStore::redeem` verifies it, mints a 48-char bearer, stores its SHA-256 hash in `engine_tokens`, returns plaintext.
4. PWA persists `{baseUrl, engineToken, deviceLabel, tunnelId}` in `localStorage`. All subsequent calls use `Authorization: Bearer <engineToken>` against `https://tunnel.gethouston.ai/e/<tunnelId>/v1/...`.

The QR does not expire. It is a high-entropy local secret stored in `phone_access` and remains stable until the user chooses Settings → Phone access → Disconnect all phones. Reset rotates the QR secret and revokes every active device token. Mobile can safely retry transient codes (`network`, `desktop_offline`, `pair_timeout`) with exponential backoff; fatal codes (`code_unknown`, `code_malformed`) bail immediately and ask the user to scan the current QR.

## Runtime

- Mobile calls `HoustonClient` methods; every HTTP request is proxied through the relay's `TunnelRoom` Durable Object and reconstituted on the Mac by `houston-tunnel`'s loopback proxy.
- Mobile's `EngineWebSocket` opens a WS to `wss://tunnel.gethouston.ai/e/<tunnelId>/v1/ws`. The DO multiplexes it onto the desktop link as `ws_open` + `ws_message` frames; desktop connects a local WS to `ws://127.0.0.1:<enginePort>/v1/ws` and proxies bytes both ways.
- TanStack Query caches every response. `use-engine-invalidation.ts` listens to the engine's `HoustonEvent` fanout and invalidates matching query keys (mirrors the desktop's pattern).

## Reactivity safety net

Three layered defences keep the PWA in sync even when the multi-hop relay chain blips or iOS Safari throttles a backgrounded tab:

1. **WS event → query invalidation.** The fast path: any `FeedItem`, `SessionStatus`, `ActivityChanged`, `ConversationsChanged` event invalidates the matching TanStack keys.
2. **WS reconnect → refetch active queries.** Events emitted during a reconnect window are never replayed, so on every reconnect we refetch everything currently mounted.
3. **Tab visibility + active-session polling.** When the tab returns to visible, we refetch active queries (iOS may have paused JS). While a session is `running`, chat history polls every 2s regardless of WS state.

Together these guarantee the user never has to manually refresh after the agent finishes working, even if WS events were dropped.

## Tunnel resilience

- Desktop sends a `Ping` frame every 30s; relay DO sends one every 20s. Either side declares the link dead if no frame of any kind arrives in 75-90s and force-closes, triggering a reconnect.
- Desktop reconnects with exponential backoff up to 60s.
- Normal network failures, laptop sleep, shutdown, app restart, and relay timeouts keep the same `tunnelId`. Existing phones must reconnect without re-pairing.
- If the relay rejects the tunnel token (401/403 on register), `houston-tunnel` invalidates `tunnel.json` and re-allocates automatically. This is treated as credential recovery, not normal reconnect behavior.

## Security model

- Every mobile HTTP request carries a device-scoped bearer, NOT the engine's bootstrap token. Engine auth middleware SHA-256s the presented token and looks it up in `engine_tokens` where `revoked_at IS NULL`.
- Resetting phone access in Settings rotates the QR secret and marks every live `engine_tokens` row `revoked_at = now()`; any future request from those phones 401s until they scan the new QR.
- The QR access secret is only used to mint device-scoped bearers. Normal mobile API calls never send the QR secret.
- The desktop's `tunnel_token` is an HMAC(tunnelId, TUNNEL_SHARED_SECRET). The shared secret lives only in the relay's Worker secrets storage. Engine never holds any credential a user couldn't mint themselves.
- Relay fails all in-flight mobile requests with 503 the moment the desktop's WS drops; mobile surfaces an "unreachable" banner and keeps serving cached reads.

## Files

| Purpose | Path |
|---|---|
| Tunnel client (outbound to relay) | `engine/houston-tunnel/` |
| Phone access store + HTTP routes | `engine/houston-engine-server/src/{mobile_access.rs,routes/tunnel.rs}` |
| Relay Worker + Durable Object | `houston-relay/` |
| PWA source (React + Vite) | `mobile/` |
| Native shell config (Capacitor) | `mobile/capacitor.config.ts` |
| Engine client library (shared with desktop) | `ui/engine-client/` |

## Native shell (Capacitor)

> Status: in progress (BRO-49…54). The web app + relay core above is unchanged; Capacitor wraps the built `dist/` bundle in a real iOS/Android app for native push, biometric unlock, and store distribution. Full rationale + decision log: `docs/specs/2026-05-23-houston-mobile-capacitor.html`.

- **What it is.** `mobile/capacitor.config.ts` wraps `webDir: "dist"` (the existing Vite build) in a native shell. `appId` `ai.gethouston.companion`. The same `@houston-ai/engine-client` talks to the relay — no protocol change.
- **Prerequisites.** iOS: Xcode + CocoaPods. Android: Android SDK (`ANDROID_HOME`) — gated until provisioned on the build host.
- **Generate the native projects** (generated/derived output is gitignored — see `mobile/.gitignore`):

```
cd mobile && bun run build      # produce dist/
bunx cap add ios                # generate ios/ (runs pod install)
bunx cap sync ios               # copy web assets + plugins into ios/
bunx cap open ios               # open in Xcode
```

- **Cross-origin.** Bundled, the app loads from `capacitor://localhost` (iOS) / `http://localhost` (Android), so engine traffic to `tunnel.gethouston.ai` is cross-origin. Auth is bearer-token (not cookies), so the relay only needs a CORS allowlist for those origins on `/e/<tunnelId>/v1/*`, `/pair/*`, `/push/register`, and the WS upgrade.
- **Push.** Engine emits a `Notify` frame over the existing tunnel on `Needs You` / finished / failed; the relay forwards it to APNs/FCM for registered devices. Engine owns policy + i18n; the relay is a dumb push pipe. Push fires only while the Mac is awake and connected (Mac-tunnel backend).
