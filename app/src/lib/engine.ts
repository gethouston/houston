/**
 * Engine client bootstrap for the Houston desktop app.
 *
 * The Tauri supervisor spawns the `houston-engine` subprocess, parses its
 * stdout for `HOUSTON_ENGINE_LISTENING port=<p> token=<t>`, and injects
 * `window.__HOUSTON_ENGINE__ = { baseUrl, token }` via
 * `initializationScript` (see `app/src-tauri/tauri.conf.json`).
 *
 * Frontend code should prefer this `engine` singleton over raw Tauri IPC.
 * OS-native calls (file pickers, reveal-in-file-manager) still live on
 * `@tauri-apps/api` — everything else flows through the engine wire.
 */

import { HoustonClient, EngineWebSocket } from "@houston-ai/engine-client";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

declare global {
  interface Window {
    __HOUSTON_ENGINE__?: {
      baseUrl: string;
      token: string;
    };
  }
}

function resolveConfig(): { baseUrl: string; token: string } | null {
  if (typeof window !== "undefined" && window.__HOUSTON_ENGINE__) {
    return window.__HOUSTON_ENGINE__;
  }
  // Dev fallback — if HOUSTON_ENGINE_BASE / TOKEN present on Vite env, use them.
  const baseUrl =
    (import.meta as any).env?.VITE_HOUSTON_ENGINE_BASE ?? null;
  const token = (import.meta as any).env?.VITE_HOUSTON_ENGINE_TOKEN ?? null;
  if (baseUrl && token) return { baseUrl, token };
  return null;
}

let _client: HoustonClient | null = null;
let _resolveReady: (() => void) | null = null;
const _ready: Promise<void> = new Promise((resolve) => {
  _resolveReady = resolve;
});

function applyConfig(config: { baseUrl: string; token: string }) {
  window.__HOUSTON_ENGINE__ = config;
  _client = new HoustonClient(config);
  if (_resolveReady) {
    _resolveReady();
    _resolveReady = null;
  }
}

// Initial attempt — config may already be injected via window.eval before
// this module loads. If so, resolve immediately.
const initial = resolveConfig();
if (initial) {
  applyConfig(initial);
}

// Race-safe fallback: pull the handshake directly from Tauri. Wins the race
// when the one-shot `houston-engine-ready` event fires before `listen()`
// below registers. The Rust command errors with "engine not ready" until
// setup() finishes; retry with backoff.
async function pullHandshakeWithRetry() {
  const deadline = Date.now() + 60_000;
  let delay = 100;
  while (Date.now() < deadline) {
    if (_client) return;
    try {
      const config = await invoke<{ baseUrl: string; token: string }>(
        "get_engine_handshake",
      );
      if (config?.baseUrl && config?.token) {
        applyConfig(config);
        return;
      }
    } catch {
      /* engine not ready yet — retry */
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 1000);
  }
  console.error("[engine] handshake pull timed out after 60s");
}

if (!_client) {
  pullHandshakeWithRetry().catch(() => {
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

export function getEngine(): HoustonClient {
  if (!_client) {
    throw new Error(
      "[engine] not bootstrapped. window.__HOUSTON_ENGINE__ missing. " +
      "Did you forget to wrap the app in <EngineGate>?",
    );
  }
  return _client;
}

/** Lazily-created shared WS instance. */
let _ws: EngineWebSocket | null = null;
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

// --- Tauri event wiring ----------------------------------------------
//
// `houston-engine-ready` fires ONCE after initial /v1/health passes. This
// is how the frontend learns the port+token when `window.eval` injection
// lost the race against React mount.
//
// `houston-engine-restarted` fires when the supervisor respawns the
// engine after a crash — rebuild the client + WS so in-flight hooks pick
// up the new transport.
listen<{ baseUrl: string; token: string }>(
  "houston-engine-ready",
  (ev) => {
    if (!_client) {
      applyConfig(ev.payload);
    }
  },
).catch(() => {
  // Non-Tauri environment (tests, mobile web) — no-op.
});

listen<{ baseUrl: string; token: string }>(
  "houston-engine-restarted",
  (ev) => {
    applyConfig(ev.payload);
    if (_ws) {
      try {
        _ws.disconnect();
      } catch {
        /* ignore */
      }
      _ws = null;
    }
    notifyEngineRestarted();
  },
).catch(() => {
  /* non-Tauri env */
});
