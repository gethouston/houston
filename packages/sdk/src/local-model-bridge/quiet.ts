// Package self-references, not relative paths: the app's node:test runner
// loads this module through a package subpath, and node resolves no
// extensionless relative import.
import { BridgeStateError } from "@houston/sdk/local-model-bridge/errors";
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";
import { NoAgentForProviderWriteError } from "@houston/sdk/no-agent-provider-write-error";

/**
 * The bridge failures that are EXPECTED states, not bugs (PRODUCT-1833). A
 * surface reports each as one fingerprinted warning and shows nothing red;
 * the classification lives here so no surface re-derives it.
 *
 * - `bridge_unsupported`: the deployment advertises no bridge capability
 *   (PRODUCT-1717); discovery stops.
 * - `bridge_no_agent`: the bootstrap asked for a runtime in a space whose
 *   validated agent list is empty; the retry curve resolves it once an agent
 *   exists (HOUSTON-APP-5E0).
 * - `bridge_state`: the SDK's own retry state (`model_unavailable`: the local
 *   server does not serve the model; `reconnecting`: the native session
 *   dropped); the bridge status surface shows it inline and the SDK retries
 *   on its own curve (HOUSTON-APP-5E1). The state is the error's message.
 *
 * Erasable syntax only: the app's node:test runner loads this module through
 * the `@houston/sdk/local-model-bridge/quiet` subpath.
 */
export type BridgeQuietClass =
  | "bridge_unsupported"
  | "bridge_no_agent"
  | "bridge_state";

export function bridgeQuietClass(error: unknown): BridgeQuietClass | null {
  if (isBridgeUnsupported(error)) return "bridge_unsupported";
  if (error instanceof NoAgentForProviderWriteError) return "bridge_no_agent";
  if (error instanceof BridgeStateError) return "bridge_state";
  return null;
}
