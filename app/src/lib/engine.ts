import { EngineWebSocket, HoustonClient } from "@houston/engine-adapter";
import type { WorkspacePreferenceReporter } from "@houston/sdk";
import {
  appUpdateChannel,
  currentAppVersion,
  installAppVersionBridge,
} from "./app-version";
import { pullEngineHandshakeWithRetry } from "./engine-handshake";
import { isLoopbackHostUrl, resolveEngine } from "./engine-mode";
import { installEngineLifecycleListeners } from "./engine-tauri-events";
import { osIsTauri } from "./os-bridge";

declare global {
  interface Window {
    __HOUSTON_ENGINE__?: {
      baseUrl: string;
      token: string;
    };
    __HOUSTON_SESSION_REFRESH__?: () => Promise<string | null>;
    __HOUSTON_ACTIVE_ORG__?: string | null;
    __HOUSTON_DEPLOY_ENV__?: "production" | "preview" | "development";
    __HOUSTON_DEPLOYMENT__?: "managed-cloud" | "desktop" | "selfhost";
  }
}

const _env = import.meta.env as Record<string, string | undefined>;
const HOST_TOKEN: string =
  _env.VITE_HOSTED_ENGINE_TOKEN ??
  _env.VITE_NEW_ENGINE_TOKEN ??
  _env.VITE_HOUSTON_ENGINE_TOKEN ??
  "";

const RESOLVED = resolveEngine(
  (import.meta.env ?? {}) as unknown as {
    VITE_NEW_ENGINE_URL?: string;
    VITE_HOSTED_ENGINE_URL?: string;
    VITE_HOSTED_ENGINE_AUTH?: string;
  },
);

const STATIC_HOST_URL: string | undefined =
  RESOLVED.kind === "static-host" ? RESOLVED.url : undefined;
const HOSTED_ENGINE_URL: string | undefined =
  RESOLVED.kind === "hosted-oauth" || RESOLVED.kind === "hosted-static"
    ? RESOLVED.url
    : undefined;
const HOSTED_OAUTH = RESOLVED.kind === "hosted-oauth";
const REMOTE_HOST_MODE = Boolean(STATIC_HOST_URL || HOSTED_ENGINE_URL);

if (typeof window !== "undefined") {
  (window as unknown as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ = true;
}

if (typeof window !== "undefined" && osIsTauri()) {
  installAppVersionBridge({
    version: currentAppVersion(),
    channel: appUpdateChannel(_env),
  });
}

function resolveConfig(): { baseUrl: string; token: string } | null {
  if (STATIC_HOST_URL) return { baseUrl: STATIC_HOST_URL, token: HOST_TOKEN };
  if (HOSTED_OAUTH) return null;
  if (HOSTED_ENGINE_URL) {
    return { baseUrl: HOSTED_ENGINE_URL, token: HOST_TOKEN };
  }
  if (typeof window !== "undefined" && window.__HOUSTON_ENGINE__) {
    return window.__HOUSTON_ENGINE__;
  }
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
let _ws: EngineWebSocket | null = null;
let _preferenceErrorReporter: WorkspacePreferenceReporter | null = null;
export function setPreferenceErrorReporter(
  report: WorkspacePreferenceReporter,
): void {
  _preferenceErrorReporter = report;
}
function applyConfig(config: { baseUrl: string; token: string }) {
  const previousEnvironment = window.__HOUSTON_ENGINE__?.baseUrl;
  window.__HOUSTON_ENGINE__ = config;
  if (_client) {
    _client.setEndpoint(config);
  } else {
    _client = new HoustonClient({
      ...config,
      onPreferenceError: (operation, error) =>
        _preferenceErrorReporter?.(operation, error),
    });
  }
  _client.setActiveOrg(window.__HOUSTON_ACTIVE_ORG__ ?? null);
  if (previousEnvironment && previousEnvironment !== config.baseUrl) {
    window.dispatchEvent(new Event("houston-engine-environment-changed"));
  }
  if (_resolveReady) {
    _resolveReady();
    _resolveReady = null;
  }
}

export function hostedOauthGateActive(): boolean {
  return HOSTED_OAUTH;
}

export function isHostedGatewayEngine(): boolean {
  return Boolean(HOSTED_ENGINE_URL);
}

export function isRemoteEngine(): boolean {
  return REMOTE_HOST_MODE;
}

export function isCoLocatedEngine(): boolean {
  if (!REMOTE_HOST_MODE) return true;
  if (STATIC_HOST_URL) return isLoopbackHostUrl(STATIC_HOST_URL);
  return false;
}

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

export function setActiveOrg(slug: string | null): boolean {
  if (typeof window === "undefined") return false;
  const previous = window.__HOUSTON_ACTIVE_ORG__ ?? null;
  const next = slug ?? null;
  if (previous === next) return false;
  window.__HOUSTON_ACTIVE_ORG__ = next;
  _client?.setActiveOrg(next);
  if (_ws) {
    _ws.disconnect();
    _ws.connect();
  }
  return true;
}

export function installHostedSessionRefresh(
  refresh: () => Promise<string | null>,
): () => void {
  if (!HOSTED_ENGINE_URL || typeof window === "undefined") return () => {};
  const handler = async () => {
    const token = await refresh();
    if (token) setHostedEngineSessionToken(token);
    return token;
  };
  window.__HOUSTON_SESSION_REFRESH__ = handler;
  return () => {
    if (window.__HOUSTON_SESSION_REFRESH__ === handler) {
      delete window.__HOUSTON_SESSION_REFRESH__;
    }
  };
}

const initial = resolveConfig();
if (initial) {
  applyConfig(initial);
}

if (!_client && !REMOTE_HOST_MODE) {
  pullEngineHandshakeWithRetry({
    hasClient: () => _client !== null,
    applyConfig,
  }).catch(() => {});
}

export function whenEngineReady(): Promise<void> {
  return _ready;
}

export function isEngineReady(): boolean {
  return _client !== null;
}

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
      } catch {}
      _ws = null;
    },
    notifyRestarted: notifyEngineRestarted,
  });
}
