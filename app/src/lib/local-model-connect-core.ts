// Dependency-free so node:test can load it: local-model-connect.ts pulls the
// engine and Tauri modules, which only load inside the app's bundler.
import type { CustomEndpoint } from "@houston/engine-adapter";
import { isBridgeCancellation } from "@houston/sdk/local-model-bridge/errors";

export class ConnectAborted extends Error {
  constructor() {
    super("Local model connection cancelled");
    this.name = "ConnectAborted";
  }
}

type Report = (error: unknown) => void;

export async function reported<T>(
  action: () => Promise<T>,
  report: Report,
  surfaced: (error: unknown) => boolean = () => false,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isBridgeCancellation(error)) throw new ConnectAborted();
    if (!surfaced(error)) report(error);
    throw error;
  }
}

export interface ManualConnectDeps {
  bridge: () => Promise<{
    replaceEndpoint(save: () => Promise<void>): Promise<void>;
  } | null>;
  save: (endpoint: CustomEndpoint) => Promise<void>;
  report: Report;
}

export async function connectManualEndpointWith(
  endpoint: CustomEndpoint,
  deps: ManualConnectDeps,
): Promise<void> {
  const bridge = await deps.bridge();
  // The save goes through `call()`, which already reports its own failure (or
  // silences an expected one) and leaves the copy to the inline form. Only the
  // bridge retirement after it is this funnel's to report (HOUSTON-APP-5N5).
  let saveFailure: { error: unknown } | null = null;
  const save = () =>
    deps.save(endpoint).catch((error: unknown) => {
      saveFailure = { error };
      throw error;
    });
  if (bridge)
    await reported(
      () => bridge.replaceEndpoint(save),
      deps.report,
      (error) => saveFailure?.error === error,
    );
  else await save();
}
