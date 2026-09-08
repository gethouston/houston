import type { CustomEndpoint } from "@houston-ai/engine-client";
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

async function reported<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ConnectAborted();
    reportLocalBridgeError(error);
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
  const save = () => tauriProvider.setCustomEndpoint(endpoint, "inline");
  if (bridge) await reported(() => bridge.replaceEndpoint(save));
  else await save();
}

export async function disconnectLocalModel(): Promise<void> {
  return reported(async () => {
    const bridge = await ownedController();
    if (bridge) await bridge.disconnect();
    else await tauriProvider.launchLogout(LOCAL_PROVIDER_ID);
  });
}
