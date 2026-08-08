# Local models (BYO endpoint + tunnel bridge)

How a user runs a model on **their own machine** (LM Studio / Jan / Ollama) and uses it from a **cloud** Houston agent. The engine stays in the cloud — teams, phone, routines all keep working — only inference (the tokens) runs on the user's hardware. This is a cost/privacy choice, not local execution: the pod calls the user's model server over the public internet.

## The shape

```
Cloud engine pod ──HTTPS──▶ https://<user>.tunnels.gethouston.ai/v1   (relay: cloud repo)
                                     │  frpc dials OUT from the user's machine
                                     ▼
Desktop: frpc ──▶ loopback auth proxy (Bearer proxyKey) ──▶ LM Studio / Jan / Ollama
```

Three merged pieces:
- **Engine/host** (`packages/host`, `packages/runtime`): the `openai-compatible` provider is enabled for cloud profiles. A managed-cloud save-time validator (`packages/host/src/custom-endpoint-validation.ts`) accepts only public HTTPS on port 443 (rejects localhost/private/loopback/link-local/metadata, IPv4 **and** IPv4-mapped IPv6, failing closed). The per-turn cloud path resolves `openai-compatible` only when an endpoint is configured — it never silently substitutes another provider — and serves the proxy key as the provider credential.
- **Relay** (`gethouston/cloud`): a self-hosted FRP relay (frps + Caddy wildcard TLS) on a **separate** cluster/VM, with gateway routes `POST /v1/tunnel/credentials` and the frps auth-plugin callback. See `cloud/k8s/gke/tunnels-README.md`.
- **Desktop** (this repo, below).

## Desktop: the local bridge

All under `app/src-tauri/src/local_bridge/` (Rust) + `app/src/**` (React), plus `app/src/lib/os-bridge.ts` wrappers and `packages/web/src/shims/tauri-core.ts` shims (desktop-only; the web shim returns null/notAvailable — which is also what keeps the status pill honest on web).

Tauri commands (registered in `app/src-tauri/src/lib.rs`, available in hosted builds):
- `detect_local_models()` — probes 127.0.0.1:1234 (LM Studio), :1337 (Jan), :11434 (Ollama), reads `/v1/models` (+ `/api/tags` for Ollama). Infallible; unreachable → `reachable:false`.
- `start_local_bridge({ targetBaseUrl, relayHost, relayPort, subdomain, token, transport, appName? })` → `{ publicUrl, localProxyPort, proxyKey }`. Generates a proxy key, starts a loopback auth reverse-proxy (hyper; requires `Authorization: Bearer <proxyKey>`, streams SSE, caps request bodies), spawns the bundled `frpc`. The proxy key is what secures the public URL — the cloud engine must present it.
- `reconnect_local_bridge({ relayHost, relayPort, subdomain, token })` — restarts the bridge **reusing the persisted proxy key**, so the already-registered cloud endpoint stays valid.
- `saved_bridge_target()` / `stop_local_bridge()` / `local_bridge_status()` (+ a `local-bridge-status` event).

Key invariants:
- **Persistence + auto-reconnect**: on a successful start the bridge descriptor + proxy key are persisted 0600 under `~/.houston/local-bridge/`. On app boot (`app/src/hooks/use-local-bridge-autoreconnect.ts`) the tunnel re-establishes automatically; the status pill's Retry = reconnect, not just a status re-read. `stop` deletes the descriptor so an explicit disconnect does not auto-reconnect.
- **No orphans**: `frpc` is supervised with the same discipline as the engine sidecar (Unix process-group + `killpg`, Windows kill-on-close Job Object — shared via `child_guard.rs`) and torn down on `RunEvent::Exit`.
- **Honest status**: the tunnel online/offline pill shows only when *this* machine owns the tunnel (a saved descriptor or an active bridge). A direct/manual endpoint, or a tunnel owned by another machine, shows the normal connected badge — never a false "offline".
- The guided UX (`app/src/components/shell/local-model-dialog*.tsx`) is jargon-free for non-technical users; the old manual OpenAI-compatible dialog is folded in as an advanced escape hatch (also the web fallback).

## Share the endpoint with a team

Opt-in publishing of the endpoint to the active organization, so teammates' agents use the same local model server. Off by default; the wire field is `CustomEndpoint.shared` (`ui/engine-client/src/types.ts`), meaningful only when saving in managed cloud and ignored elsewhere.

- **The toggle** — `ShareEndpointToggle` (`app/src/components/shell/local-model-share-toggle.tsx`), a props-only `Switch` with `providers:localModel.share.{label,help}` copy. Rendered by BOTH doors: the guided pick step (`local-model-pick.tsx`) and the manual form (`local-model-manual-form.tsx`).
- **The state** — `useLocalModelShare(workspaceId)` (`app/src/hooks/use-local-model-share.ts`) owns the boolean and **resets it to `false` whenever the active workspace changes**, so a toggle set for one team can never follow the user into a team they just switched to.
- **Team-gated at the send site, not just the UI** — `useLocalModelConnect` takes a `teamWorkspace` flag and sends `shared: teamWorkspace && shared`; the manual form spreads `shared: true` only under the same conjunction. A personal workspace therefore never publishes, whatever the toggle holds.
- **Both connect paths carry it** — `connectDetectedModel` (`app/src/lib/local-model-connect.ts`) passes `shared` through to `buildLocalEndpoint` (tunnel path) and `buildDirectEndpoint` (no-relay deployments: dev, desktop-local engine, self-host).

## frpc bundling (release builds)

`frpc` (fatedier/frp, Apache-2.0, pinned to the relay's version) ships as a second Tauri `externalBin`. `scripts/fetch-frpc.sh <triple>` downloads + sha256-verifies the per-arch binary; `app/src-tauri/build.rs` stages it. A missing `frpc` at build time stages a loud-fail placeholder (never a silent no-op) — so **release CI must run `scripts/fetch-frpc.sh` before packaging**, same as the host sidecar.

## Limitation

The machine running the model must be awake and online; a cloud routine firing at 3am against a closed laptop fails (surfaced as the offline state). The strongest deployment is an always-on shared box (e.g. a company Mac Studio running an OpenAI-compatible server), which everyone on the team points their agents at.
