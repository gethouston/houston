/**
 * Connect / reconnect / disconnect orchestration for the guided "connect a local
 * model" flow. Thin async functions the dialog awaits; each surfaces its own
 * failures (no silent catch) and the dialog also renders a calm inline retry
 * state.
 *
 * The engine-backed steps (`getTunnelCredentials`, `setCustomEndpoint`,
 * `launchLogout`) already toast the real reason with a Report-bug affordance via
 * the `call()` wrapper; the raw native bridge steps (`detect`, `start`,
 * `reconnect`, `stop`) are surfaced here through `showErrorToast` so they carry
 * the same affordance.
 */

import type { CustomEndpoint } from "@houston-ai/engine-client";
import { showErrorToast } from "./error-toast";
import {
  buildDirectEndpoint,
  buildLocalEndpoint,
  type DetectedServer,
  reconnectBridgeArgs,
} from "./local-model";
import {
  osDetectLocalModels,
  osReconnectLocalBridge,
  osStartLocalBridge,
  osStopLocalBridge,
} from "./os-bridge";
import { tauriProvider } from "./tauri";

/** The engine provider id the local endpoint registers under. */
export const LOCAL_PROVIDER_ID = "openai-compatible";

/**
 * Set while a bridge lifecycle op (connect/reconnect) is running, so the boot
 * auto-reconnect can skip when a manual connect is already in flight. The native
 * side serializes bridge ops regardless (BRIDGE_OP), but this avoids a redundant
 * teardown-rebuild that the hook's status TOCTOU would otherwise let through.
 */
let bridgeOpInFlight = false;
export function isBridgeOpInFlight(): boolean {
  return bridgeOpInFlight;
}
async function withBridgeOp<T>(fn: () => Promise<T>): Promise<T> {
  bridgeOpInFlight = true;
  try {
    return await fn();
  } finally {
    bridgeOpInFlight = false;
  }
}

/** Surface a raw native-bridge failure with the standard Report-bug toast. */
function surfaceRaw(command: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  showErrorToast(command, message, err);
}

/** True when the caller aborted (dialog closed mid-flight). */
function isAbort(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

/** Raised when a connect is aborted; callers treat it as a silent cancel. */
export class ConnectAborted extends Error {
  constructor() {
    super("local-model connect aborted");
    this.name = "ConnectAborted";
  }
}

/**
 * Stop the bridge and SURFACE any failure (a zombie frpc that keeps a dying
 * tunnel alive must never be silent — beta no-silent-failures policy). Used for
 * rollback and cancel, where the primary path may already have toasted.
 */
async function stopBridgeSurfaced(): Promise<void> {
  try {
    await osStopLocalBridge();
  } catch (err) {
    surfaceRaw("stop_local_bridge", err);
  }
}

/** Scan the local machine for OpenAI-compatible model servers. */
export async function detectLocalModels(): Promise<DetectedServer[]> {
  try {
    return await osDetectLocalModels();
  } catch (err) {
    surfaceRaw("detect_local_models", err);
    throw err;
  }
}

/**
 * The full guided connect: mint tunnel credentials, start the bridge, then
 * register the resulting public endpoint on the agent. Rolls the bridge back if
 * the final registration fails (or the caller aborts after start) so we never
 * leave frpc running with no endpoint. Pass `signal` to abort a closed dialog.
 */
export async function connectDetectedModel(opts: {
  server: DetectedServer;
  model: string;
  name: string;
  appName: string;
  /** Surface the model's chain-of-thought as thinking in Houston. */
  reasoning?: boolean;
  /** Share this endpoint with the active team workspace. */
  shared?: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  return withBridgeOp(async () => {
    const cred = await tauriProvider.getTunnelCredentials();
    if (isAbort(opts.signal)) throw new ConnectAborted();

    // No relay in this deployment (dev, desktop-local engine, self-host): the
    // engine is co-located with the detected server, so register it DIRECTLY —
    // no bridge, no proxy key. The engine's save-time validation stays the
    // authority (a managed cloud pod still rejects a localhost URL, loudly).
    if (!cred) {
      await tauriProvider.setCustomEndpoint(
        buildDirectEndpoint({
          server: opts.server,
          model: opts.model,
          name: opts.name,
          reasoning: opts.reasoning,
          shared: opts.shared,
        }),
      );
      return;
    }

    let bridge: Awaited<ReturnType<typeof osStartLocalBridge>>;
    try {
      bridge = await osStartLocalBridge({
        targetBaseUrl: opts.server.baseUrl,
        relayHost: cred.relayHost,
        relayPort: cred.relayPort,
        subdomain: cred.subdomain,
        token: cred.token,
        transport: cred.transport,
        appName: opts.appName,
      });
    } catch (err) {
      surfaceRaw("start_local_bridge", err);
      throw err;
    }

    // Aborted while frpc came up: tear it back down, don't register a dangling
    // endpoint or leave a half-open bridge.
    if (isAbort(opts.signal)) {
      await stopBridgeSurfaced();
      throw new ConnectAborted();
    }

    const endpoint = buildLocalEndpoint({
      publicUrl: bridge.publicUrl,
      model: opts.model,
      name: opts.name,
      proxyKey: bridge.proxyKey,
      reasoning: opts.reasoning,
      shared: opts.shared,
    });
    try {
      await tauriProvider.setCustomEndpoint(endpoint);
    } catch (err) {
      // Roll back the half-open bridge; the primary failure already toasted and
      // a rollback failure is surfaced too (no silent zombie tunnel).
      await stopBridgeSurfaced();
      throw err;
    }
  });
}

/**
 * Re-establish the tunnel for the saved target after an app restart (frpc is
 * gone but the cloud endpoint persists): mint fresh credentials and reconnect,
 * reusing the persisted proxyKey so no endpoint re-registration is needed.
 */
export async function reconnectLocalModel(signal?: AbortSignal): Promise<void> {
  return withBridgeOp(async () => {
    const cred = await tauriProvider.getTunnelCredentials();
    if (isAbort(signal)) throw new ConnectAborted();
    // A saved bridge exists but the deployment no longer offers a relay
    // (signed out of the hosted workspace, relay unconfigured): the tunnel
    // cannot come back — surface it, never spin silently.
    if (!cred) {
      const err = new Error(
        "This workspace has no tunnel relay, so the saved local-model bridge cannot reconnect.",
      );
      surfaceRaw("reconnect_local_bridge", err);
      throw err;
    }
    try {
      await osReconnectLocalBridge(reconnectBridgeArgs(cred));
    } catch (err) {
      surfaceRaw("reconnect_local_bridge", err);
      throw err;
    }
  });
}

/**
 * The advanced/manual path (and the web fallback where no native bridge exists):
 * register a base URL + model directly, with no tunnel. Mirrors the old manual
 * OpenAI-compatible dialog.
 */
export async function connectManualEndpoint(
  endpoint: CustomEndpoint,
): Promise<void> {
  await tauriProvider.setCustomEndpoint(endpoint);
}

/**
 * Disconnect: tear the bridge down first (so no in-flight turn keeps reaching a
 * dying tunnel), then clear the agent's local provider.
 */
export async function disconnectLocalModel(): Promise<void> {
  try {
    await osStopLocalBridge();
  } catch (err) {
    surfaceRaw("stop_local_bridge", err);
    throw err;
  }
  await tauriProvider.launchLogout(LOCAL_PROVIDER_ID);
}
