import type { CustomEndpoint } from "@houston/engine-adapter";
import { peekSession } from "./identity/session-store";
import {
  localBridgeController,
  localBridgeSnapshot,
} from "./local-bridge-binding";
import { reportLocalBridgeError } from "./local-bridge-ports";
import { buildDirectEndpoint, type DetectedServer } from "./local-model";
import {
  connectManualEndpointWith,
  reported,
} from "./local-model-connect-core";
import { osDetectLocalModels, osIsTauri } from "./os-bridge";
import { tauriProvider } from "./tauri";

export const LOCAL_PROVIDER_ID = "openai-compatible";
export { ConnectAborted } from "./local-model-connect-core";

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

export function detectLocalModels(): Promise<DetectedServer[]> {
  return reported(osDetectLocalModels, reportLocalBridgeError);
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
  }, reportLocalBridgeError);
}

export async function reconnectLocalModel(): Promise<void> {
  return reported(async () => {
    const bridge = await controller();
    if (!bridge)
      throw new Error("This model does not use a managed connection");
    await bridge.reconnect();
  }, reportLocalBridgeError);
}

export function connectManualEndpoint(endpoint: CustomEndpoint): Promise<void> {
  return connectManualEndpointWith(endpoint, {
    bridge: ownedController,
    save: (manual) => tauriProvider.setCustomEndpoint(manual, "inline"),
    report: reportLocalBridgeError,
  });
}

export async function disconnectLocalModel(): Promise<void> {
  return reported(async () => {
    const bridge = await ownedController();
    if (bridge) await bridge.disconnect();
    else await tauriProvider.launchLogout(LOCAL_PROVIDER_ID);
  }, reportLocalBridgeError);
}
