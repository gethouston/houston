/** Engine client bootstrap for the Houston desktop app. */

import { EngineWebSocket, HoustonClient } from "@houston-ai/engine-client";
import { isTauri } from "@tauri-apps/api/core";
import { getEngineConnection } from "./engine-connection";
import { pullEngineHandshakeWithRetry } from "./engine-handshake";
import { controlPlaneBuild, resolveEngine } from "./engine-mode";
import { installRustEngineLifecycleListeners } from "./engine-tauri-events";

declare global {
  interface Window {
    __HOUSTON_ENGINE__?: {
      baseUrl: string;
      token: string;
    };
  }
}

/**
 * Cutover switch. When `VITE_NEW_ENGINE_URL` is set, the desktop frontend talks
 * to the v3 Houston host (host mode) instead of the Tauri-spawned Rust
 * engine — mirroring packages/web's same flag. The host URL + token come from
 * the env (the host runs as the sidecar, or by hand in dev). Unset → the Rust
 * path below is completely untouched, so the default build stays releasable and
 * a downgrade is just "don't set the flag".
 */
const _env = import.meta.env as Record<string, string | undefined>;
const HOST_TOKEN: string =
  _env.VITE_HOSTED_ENGINE_TOKEN ??
  _env.VITE_NEW_ENGINE_TOKEN ??
  _env.VITE_HOUSTON_ENGINE_TOKEN ??
  "";

// Fold the build-time engine env flags together with the user's runtime
// local-vs-remote choice (HOU-621). The choice is read synchronously here at
// module load — before any HoustonClient is constructed — so applying a new one
// reloads the webview to re-run this module deterministically (the same
// "set before any client is built" invariant HOU-546 relies on below).
const RESOLVED = resolveEngine(
  (import.meta.env ?? {}) as unknown as {
    VITE_NEW_ENGINE_URL?: string;
    VITE_HOSTED_ENGINE_URL?: string;
    VITE_HOSTED_ENGINE_AUTH?: string;
    VITE_NEW_ENGINE?: string;
  },
  getEngineConnection(),
  // Desktop-only chooser. In a browser (packages/web) isTauri() is false, so the
  // TS-engine web build stays on the injected-config path instead of a chooser
  // that never renders — see resolveEngine + the packages/web new-engine entry.
  isTauri(),
);

// A TS-engine build still awaiting the user's connection choice: engine.ts stays
// inert (no client, no sidecar handshake) while <ConnectionGate> shows the
// chooser. Picking an option persists it and reloads, re-running this module.
const PENDING = RESOLVED.kind === "pending";
const STATIC_HOST_URL: string | undefined =
  RESOLVED.kind === "static-host" ? RESOLVED.url : undefined;
// Hosted gateway URL, from either VITE_HOSTED_ENGINE_URL or a runtime `remote`
// choice. OAuth (the default / every runtime remote) gates the app behind the
// Supabase Google-login screen and feeds the session token in via
// setHostedEngineSessionToken, so the gateway only ever sees a verified user
// JWT. `hosted-static` points straight at the URL with the build's HOST_TOKEN
// (no login — for service-token smoke tests against e.g. the local kind gateway).
const HOSTED_ENGINE_URL: string | undefined =
  RESOLVED.kind === "hosted-oauth" || RESOLVED.kind === "hosted-static"
    ? RESOLVED.url
    : undefined;
const HOSTED_OAUTH = RESOLVED.kind === "hosted-oauth";
const REMOTE_HOST_MODE = Boolean(STATIC_HOST_URL || HOSTED_ENGINE_URL);

// When the new-engine adapter is aliased in (VITE_NEW_ENGINE or
// VITE_NEW_ENGINE_URL — see app/vite.config.ts `useHost`), the desktop ALWAYS
// talks to a v3 host, so flip the adapter into host mode. This must be
// set HERE, at module load, before any HoustonClient is constructed: the
// adapter reads window.__HOUSTON_CP__ in its constructor, and the handshake can
// arrive via the get_engine_handshake poll or the houston-engine-ready event —
// neither of which sets this flag. On a cold first launch that poll wins the
// race against the Tauri window.eval injection and a Rust-wire client gets
// built against the v3 host -> every turn fails with "Session error" until the
// next launch (the warm sidecar lets the injection land first). Setting the
// flag from the build constant closes that race for all delivery paths. HOU-546.
// import.meta typing differs between the app and packages/web tsconfigs that
// both compile this file, so cast env to controlPlaneBuild's expected shape.
const NEW_ENGINE = controlPlaneBuild(
  (import.meta.env ?? {}) as unknown as {
    VITE_NEW_ENGINE_URL?: string;
    VITE_HOSTED_ENGINE_URL?: string;
    VITE_NEW_ENGINE?: string;
  },
);
if (NEW_ENGINE && typeof window !== "undefined") {
  (window as unknown as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ = true;
}

function resolveConfig(): { baseUrl: string; token: string } | null {
  // Awaiting the runtime connection choice — build nothing until the reload.
  if (PENDING) return null;
  // Host mode wins: point at the v3 host, overriding the Tauri-injected Rust
  // engine handshake.
  if (STATIC_HOST_URL) return { baseUrl: STATIC_HOST_URL, token: HOST_TOKEN };
  // Hosted OAuth (a managed gateway, OR the runtime `remote` choice): the client
  // is built ONLY from the Supabase session token via setHostedEngineSessionToken.
  // Return null here even though the TS-engine chooser build has a Tauri-spawned
  // sidecar injecting window.__HOUSTON_ENGINE__ (lib.rs) — adopting that would
  // wrongly point the remote connection at the local sidecar.
  if (HOSTED_OAUTH) return null;
  // Hosted gateway with OAuth disabled: point at the gateway with the static
  // bearer immediately, exactly like STATIC_HOST_URL.
  if (HOSTED_ENGINE_URL) {
    return { baseUrl: HOSTED_ENGINE_URL, token: HOST_TOKEN };
  }
  if (typeof window !== "undefined" && window.__HOUSTON_ENGINE__) {
    return window.__HOUSTON_ENGINE__;
  }
  // Dev fallback — if HOUSTON_ENGINE_BASE / TOKEN present on Vite env, use them.
  const baseUrl = _env.VITE_HOUSTON_ENGINE_BASE ?? null;
  const token = _env.VITE_HOUSTON_ENGINE_TOKEN ?? null;
  if (baseUrl && token) return { baseUrl, token };
  return null;
}

let _client: HoustonClient | null = null;
let _resolveReady: (() => void) | null = null;
const _ready: Promise<void> = new Promise((resolve) => {
  _resolveReady = resolve;
});
/** Lazily-created shared WS instance. */
let _ws: EngineWebSocket | null = null;
function applyConfig(config: { baseUrl: string; token: string }) {
  window.__HOUSTON_ENGINE__ = config;
  if (_client) {
    // Engine restarted on a fresh random port: repoint the EXISTING client in
    // place so requests already mid-flight (and every hook holding this
    // instance) recover on their next retry instead of hammering the dead
    // port. Building a new client would strand those stale references. The
    // client's own retry/backoff bridges the restart gap (HOU-432).
    _client.setEndpoint(config);
  } else {
    _client = new HoustonClient(config);
  }
  if (_resolveReady) {
    _resolveReady();
    _resolveReady = null;
  }
}

/**
 * True when the desktop should run the Supabase Google-login gate: a hosted
 * gateway URL is set AND its auth mode is OAuth (`VITE_HOSTED_ENGINE_AUTH`).
 * Static-token hosted mode skips the login UI and bootstraps from HOST_TOKEN in
 * resolveConfig, exactly like `VITE_NEW_ENGINE_URL`.
 */
export function hostedOauthGateActive(): boolean {
  return HOSTED_OAUTH;
}

/**
 * True while a TS-engine build is waiting for the user's local-vs-remote pick
 * (HOU-621). `<ConnectionGate>` shows the chooser instead of the engine gates
 * until a choice is persisted (which then reloads the webview).
 */
export function isConnectionPending(): boolean {
  return PENDING;
}

/**
 * True when the active engine is NOT co-located with this client — a baked host
 * URL, a hosted gateway, OR the runtime `remote` choice (HOU-621). Callers that
 * decide OAuth loopback-vs-device-code topology must consult this: the runtime's
 * localhost callback lives on the remote host, so provider login has to use the
 * device-code flow. See `providerLoginUsesDeviceAuthByDefault` + `tauri.ts`.
 */
export function isRemoteEngine(): boolean {
  return REMOTE_HOST_MODE;
}

/** Updates the hosted engine bearer token from the current Supabase session. */
export function setHostedEngineSessionToken(token: string | null): void {
  if (!HOSTED_ENGINE_URL || typeof window === "undefined") return;
  const previousToken = window.__HOUSTON_ENGINE__?.token ?? null;
  const config = { baseUrl: HOSTED_ENGINE_URL, token: token ?? "" };
  window.__HOUSTON_ENGINE__ = config;
  if (!token) {
    _ws?.disconnect();
    _ws = null;
    return;
  }
  applyConfig(config);
  if (previousToken !== token && _ws) {
    _ws.disconnect();
    _ws.connect();
  }
}

// Initial attempt — config may already be injected via window.eval before
// this module loads. If so, resolve immediately.
const initial = resolveConfig();
if (initial) {
  applyConfig(initial);
}

// Host mode supplies the config from the env, so skip the Tauri/Rust handshake.
// PENDING builds stay inert until the chooser reload.
if (!_client && !REMOTE_HOST_MODE && !PENDING) {
  pullEngineHandshakeWithRetry({
    hasClient: () => _client !== null,
    applyConfig,
  }).catch(() => {
    /* non-Tauri env — listen() path covers other callers */
  });
}

/**
 * Resolves when the engine handshake has been received.
 *
 * The Tauri supervisor spawns houston-engine and emits
 * `houston-engine-ready` with `{ baseUrl, token }` after /v1/health passes.
 * Wrap the app root in `<EngineGate>` (see main.tsx) to await this before
 * rendering — otherwise hooks that call `getEngine()` in their first
 * `useEffect` will throw.
 */
export function whenEngineReady(): Promise<void> {
  return _ready;
}

export function isEngineReady(): boolean {
  return _client !== null;
}

/**
 * True when the active backend is the new TS engine. Set by the engine-adapter
 * (the only client that talks to the host); the legacy Rust engine never sets
 * it. Gates new-engine-only capabilities in the UI — notably API-key providers
 * (OpenCode Zen / Go), which the Rust engine can't serve.
 */
export function newEngineActive(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as { __HOUSTON_NEW_ENGINE__?: boolean })
      .__HOUSTON_NEW_ENGINE__
  );
}

export function getEngine(): HoustonClient {
  if (!_client) {
    throw new Error(
      "[engine] not bootstrapped. window.__HOUSTON_ENGINE__ missing. " +
        "Did you forget to wrap the app in <EngineGate>?",
    );
  }
  return _client;
}

export function getEngineWs(): EngineWebSocket {
  if (!_ws) {
    _ws = new EngineWebSocket(getEngine());
    _ws.connect();
  }
  return _ws;
}

const restartListeners = new Set<() => void>();

export function onEngineRestarted(listener: () => void): () => void {
  restartListeners.add(listener);
  return () => {
    restartListeners.delete(listener);
  };
}

function notifyEngineRestarted() {
  for (const listener of restartListeners) {
    try {
      listener();
    } catch (err) {
      console.error("[engine] restart listener failed", err);
    }
  }
}

if (!REMOTE_HOST_MODE && !PENDING) {
  installRustEngineLifecycleListeners({
    hasClient: () => _client !== null,
    applyConfig,
    resetWebSocket: () => {
      if (!_ws) return;
      try {
        _ws.disconnect();
      } catch {
        /* ignore */
      }
      _ws = null;
    },
    notifyRestarted: notifyEngineRestarted,
  });
}
