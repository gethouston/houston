import type { CustomEndpoint } from "@houston/engine-adapter";
import { isBridgeCancellation } from "@houston/sdk";
import { peekSession } from "./identity/session-store";
import {
  localBridgeController,
  localBridgeSnapshot,
} from "./local-bridge-binding";
import { reportLocalBridgeError } from "./local-bridge-ports";
import { buildDirectEndpoint, type DetectedServer } from "./local-model";
import { osDetectLocalModels, osIsTauri } from "./os-bridge";
import { tauriProvider } from "./tauri";

export const LOCAL_PROVIDER_ID = "openai-compatible";
export class ConnectAborted extends Error {
  constructor() {
    super("Local model connection cancelled");
    this.name = "ConnectAborted";
  }
}

async function controller() {
  const session = await peekSession();
  return localBridgeController(session?.uid ?? "");
}

async function ownedController() {
  const snapshot = localBridgeSnapshot();
  return osIsTauri() &&
    (snapshot.journal ||
      snapshot.status === "connecting" ||
      snapshot.status === "reconnecting")
    ? controller()
    : null;
}

async function reported<T>(
  action: () => Promise<T>,
  surfaced: (error: unknown) => boolean = () => false,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isBridgeCancellation(error)) throw new ConnectAborted();
    if (!surfaced(error)) reportLocalBridgeError(error);
    throw error;
  }
}

export function detectLocalModels(): Promise<DetectedServer[]> {
  return reported(osDetectLocalModels);
}

export async function connectDetectedModel(opts: {
  server: DetectedServer;
  model: string;
  name: string;
  appName: string;
  reasoning?: boolean;
  shared?: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  return reported(async () => {
    opts.signal?.throwIfAborted();
    const bridge = await controller();
    opts.signal?.throwIfAborted();
    if (!bridge) {
      await tauriProvider.setCustomEndpoint(buildDirectEndpoint(opts));
      return;
    }
    await bridge.connect(
      {
        targetBaseUrl: opts.server.baseUrl,
        model: opts.model,
        name: opts.name,
        appName: opts.appName,
        reasoning: opts.reasoning,
        shared: opts.shared,
      },
      opts.signal,
    );
  });
}

export async function reconnectLocalModel(): Promise<void> {
  return reported(async () => {
    const bridge = await controller();
    if (!bridge)
      throw new Error("This model does not use a managed connection");
    await bridge.reconnect();
  });
}

export async function connectManualEndpoint(
  endpoint: CustomEndpoint,
): Promise<void> {
  const bridge = await ownedController();
  // The save goes through `call()`, which already reports its own failure (or
  // silences an expected one) and leaves the copy to the inline form. Only the
  // bridge retirement after it is this funnel's to report (HOUSTON-APP-5N5).
  let saveFailure: { error: unknown } | null = null;
  const save = () =>
    tauriProvider.setCustomEndpoint(endpoint, "inline").catch((error) => {
      saveFailure = { error };
      throw error;
    });
  if (bridge)
    await reported(
      () => bridge.replaceEndpoint(save),
      (error) => saveFailure?.error === error,
    );
  else await save();
}

export async function disconnectLocalModel(): Promise<void> {
  return reported(async () => {
    const bridge = await ownedController();
    if (bridge) await bridge.disconnect();
    else await tauriProvider.launchLogout(LOCAL_PROVIDER_ID);
  });
}
