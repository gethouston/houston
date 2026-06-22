// Singleton HoustonClient + EngineWebSocket.
//
// Pattern: the app boots with no client (unpaired), then the pairing
// flow writes `{baseUrl, engineToken}` to Preferences and calls
// `initEngine(...)`. Every subsequent hook reads `getEngine()` which
// throws if called before init — React Query retries and re-reads once
// pairing completes.
//
// Readiness is observable via `subscribeReady` / `useEngineReady` so
// effects can re-run when pairing completes mid-session. Without this,
// hooks that mount BEFORE the engine is ready (e.g. on the QR-scan
// boot path where `?code=` triggers the React tree to render before
// pairing redemption finishes) silently never subscribe — the user
// then sees a half-working app until they refresh.

import { EngineWebSocket, HoustonClient } from "@houston-ai/engine-client";
import { useSyncExternalStore } from "react";
import type { PairedEngine } from "./storage";

let client: HoustonClient | null = null;
let ws: EngineWebSocket | null = null;
let paired: PairedEngine | null = null;

const readinessListeners = new Set<() => void>();

function notifyReadiness(): void {
  for (const fn of readinessListeners) {
    try {
      fn();
    } catch (e) {
      console.error("[engine] readiness listener threw:", e);
    }
  }
}

export function initEngine(p: PairedEngine): void {
  client = new HoustonClient({ baseUrl: p.baseUrl, token: p.engineToken });
  ws = new EngineWebSocket(client);
  paired = p;
  ws.connect();
  notifyReadiness();
}

export function stopEngine(): void {
  ws?.disconnect();
  ws = null;
  client = null;
  paired = null;
  notifyReadiness();
}

export function getEngine(): HoustonClient {
  if (!client) throw new Error("engine not initialized — finish pairing first");
  return client;
}

export function getWs(): EngineWebSocket {
  if (!ws) throw new Error("engine WS not initialized");
  return ws;
}

export function getPaired(): PairedEngine | null {
  return paired;
}

export function isEngineReady(): boolean {
  return client !== null;
}

/** Subscribe to engine readiness changes. Called every time `initEngine`
 *  or `stopEngine` runs. Returns an unsubscribe fn. */
export function subscribeReady(cb: () => void): () => void {
  readinessListeners.add(cb);
  return () => {
    readinessListeners.delete(cb);
  };
}

/** React hook: returns the current engine readiness, re-renders the
 *  caller whenever readiness flips. Pair this with effects that need
 *  to wait for `initEngine` to land before doing setup work. */
export function useEngineReady(): boolean {
  return useSyncExternalStore(subscribeReady, isEngineReady, isEngineReady);
}
