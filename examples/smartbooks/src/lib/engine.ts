/**
 * Singleton HoustonClient wired to the config in localStorage.
 *
 * The client is the ONLY dependency on Houston — the rest of the app is
 * plain React. This is the whole point of the example: drop this file and
 * you can talk to the engine from any web runtime (custom desktop shell,
 * mobile PWA, internal admin tool, whatever).
 */

import { EngineWebSocket, HoustonClient } from "@houston-ai/engine-client";
import type { EngineConfig } from "./config";

let _client: HoustonClient | null = null;
let _ws: EngineWebSocket | null = null;
let _activeConfig: EngineConfig | null = null;

export function connectEngine(cfg: EngineConfig): HoustonClient {
  _client = new HoustonClient(cfg);
  _activeConfig = cfg;
  // WS lazily created on first getWs() call.
  if (_ws) {
    _ws.disconnect();
    _ws = null;
  }
  return _client;
}

export function getClient(): HoustonClient {
  if (!_client) {
    throw new Error("Engine not connected. Call connectEngine() first.");
  }
  return _client;
}

export function getWs(): EngineWebSocket {
  if (!_ws) {
    const ws = new EngineWebSocket(getClient());
    ws.connect();
    _ws = ws;
  }
  return _ws;
}

export function activeConfig(): EngineConfig | null {
  return _activeConfig;
}
