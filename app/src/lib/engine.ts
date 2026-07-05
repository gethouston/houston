/** Engine client bootstrap for the Houston desktop app. */

import { EngineWebSocket, HoustonClient } from "@houston-ai/engine-client";
import { pullEngineHandshakeWithRetry } from "./engine-handshake";
import { isLoopbackHostUrl, resolveEngine } from "./engine-mode";
import { installEngineLifecycleListeners } from "./engine-tauri-events";

declare global {
  interface Window {
    __HOUSTON_ENGINE__?: {
      baseUrl: string;
      token: string;
    };
  }
}

/**
 * Remote-host switch. When `VITE_NEW_ENGINE_URL` is set, the desktop frontend
 * talks to an external v3 Houston host instead of the Tauri-spawned local host
 * sidecar — mirroring packages/web. The host URL + token come from the env (by
 * hand in dev). Unset → the app uses the local sidecar the Tauri shell spawns.
 */
const _env = import.meta.env as Record<string, string | undefined>;
const HOST_TOKEN: string =
  _env.VITE_HOSTED_ENGINE_TOKEN ??
  _env.VITE_NEW_ENGINE_TOKEN ??
  _env.VITE_HOUSTON_ENGINE_TOKEN ??
  "";

// Resolve the engine transport from the build-time env flags, synchronously at
// module load — before any HoustonClient is constructed (the "set before any
// client is built" invariant HOU-546 relies on below).
const RESOLVED = resolveEngine(
  (import.meta.env ?? {}) as unknown as {
    VITE_NEW_ENGINE_URL?: string;
    VITE_HOSTED_ENGINE_URL?: string;
    VITE_HOSTED_ENGINE_AUTH?: string;
  },
);

const STATIC_HOST_URL: string | undefined =
  RESOLVED.kind === "static-host" ? RESOLVED.url : undefined;
// Hosted gateway URL (VITE_HOSTED_ENGINE_URL, baked into the build). OAuth (the
// default) gates the app behind the Supabase Google-login screen and feeds the
// session token in via setHostedEngineSessionToken, so the gateway only ever
// sees a verified user JWT. `hosted-static` points straight at the URL with the
// build's HOST_TOKEN (no login — for service-token smoke tests against e.g. the
// local kind gateway).
const HOSTED_ENGINE_URL: string | undefined =
  RESOLVED.kind === "hosted-oauth" || RESOLVED.kind === "hosted-static"
    ? RESOLVED.url
    : undefined;
const HOSTED_OAUTH = RESOLVED.kind === "hosted-oauth";
const REMOTE_HOST_MODE = Boolean(STATIC_HOST_URL || HOSTED_ENGINE_URL);

// The v3 host adapter is the only engine client (aliased in unconditionally —
// see app/vite.config.ts), so flip it into host mode. This must be set HERE, at
// module load, before any HoustonClient is constructed: the adapter reads
// window.__HOUSTON_CP__ in its constructor, and the sidecar handshake can arrive
// via the get_engine_handshake poll or the houston-engine-ready event — neither
// of which sets this flag. On a cold first launch that poll can win the race
// against the Tauri window.eval injection; without the flag a mis-moded client
// gets built against the v3 host -> every turn fails with "Session error" until
// the next launch. Setting it as a build constant closes that race for all
// delivery paths. HOU-546.
if (typeof window !== "undefined") {
  (window as unknown as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ = true;
}

function resolveConfig(): { baseUrl: string; token: string } | null {
  // Remote host wins: point at the external v3 host, overriding the
  // sidecar-injected handshake.
  if (STATIC_HOST_URL) return { baseUrl: STATIC_HOST_URL, token: HOST_TOKEN };
  // Hosted OAuth (a managed gateway): the client is built ONLY from the
  // Supabase session token via setHostedEngineSessionToken. Return null here
  // even if a Tauri-spawned sidecar injected window.__HOUSTON_ENGINE__
  // (lib.rs) — adopting that would wrongly point the hosted connection at the
  // local sidecar.
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
 * True when the active engine is NOT co-located with this client — a baked host
 * URL or a hosted gateway. Callers that decide OAuth loopback-vs-device-code
 * topology must consult this: the runtime's localhost callback lives on the
 * remote host, so provider login has to use the device-code flow. See
 * `providerLoginUsesDeviceAuthByDefault` + `tauri.ts`.
 */
export function isRemoteEngine(): boolean {
  return REMOTE_HOST_MODE;
}

/**
 * True when the active engine runs on THIS machine: the Tauri-spawned sidecar
 * (Rust engine or TS host), or a dev `VITE_NEW_ENGINE_URL` pointing at
 * loopback (the two-terminal setup). OS affordances — reveal/open in the file
 * manager — only make sense then: a remote host's paths don't exist on this
 * machine, even when that host serves the local capability profile
 * (self-host VPS). Mirrors the provider-auth co-location rule
 * (`providerLoginUsesDeviceAuthByDefault`).
 */
export function isCoLocatedEngine(): boolean {
  if (!REMOTE_HOST_MODE) return true;
  if (STATIC_HOST_URL) return isLoopbackHostUrl(STATIC_HOST_URL);
  return false; // hosted gateways are always remote
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

// Remote host mode supplies the config from the env, so skip the Tauri sidecar
// handshake.
if (!_client && !REMOTE_HOST_MODE) {
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
 * True once the host adapter's client has been constructed (the adapter sets
 * `window.__HOUSTON_NEW_ENGINE__`). The host is the only engine now, so this is
 * effectively "a host client is live"; it still gates UI that needs a live host
 * connection (e.g. API-key provider surfaces). A candidate to fold away in the
 * v3-client consolidation follow-up.
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

if (!REMOTE_HOST_MODE) {
  installEngineLifecycleListeners({
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
