/** Engine client bootstrap for the Houston desktop app. */

import { EngineWebSocket, HoustonClient } from "@houston-ai/engine-client";
import { pullEngineHandshakeWithRetry } from "./engine-handshake";
import { controlPlaneBuild } from "./engine-mode";
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
const STATIC_HOST_URL: string | undefined =
  _env.VITE_NEW_ENGINE_URL || undefined;
const HOSTED_ENGINE_URL: string | undefined =
  _env.VITE_HOSTED_ENGINE_URL || undefined;
const HOST_TOKEN: string =
  _env.VITE_NEW_ENGINE_TOKEN ?? _env.VITE_HOUSTON_ENGINE_TOKEN ?? "";
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
  // Host mode wins: point at the v3 host, overriding the Tauri-injected Rust
  // engine handshake.
  if (STATIC_HOST_URL) return { baseUrl: STATIC_HOST_URL, token: HOST_TOKEN };
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
  _client = new HoustonClient(config);
  if (_resolveReady) {
    _resolveReady();
    _resolveReady = null;
  }
}

/** True when this build should use Supabase-authenticated hosted engine mode. */
export function hostedEngineActive(): boolean {
  return Boolean(HOSTED_ENGINE_URL);
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

if (!REMOTE_HOST_MODE) {
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
