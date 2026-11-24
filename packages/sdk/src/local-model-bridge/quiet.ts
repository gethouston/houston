import {
  BridgeStateError,
  isBridgeRelayUnreachable,
  isMigrationReconnect,
  isStaleBridgeSession,
} from "@houston/sdk/local-model-bridge/errors";
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";
import { NoAgentForProviderWriteError } from "@houston/sdk/no-agent-provider-write-error";

/**
 * The bridge failures that are EXPECTED states, not bugs. A
 * surface reports each as one fingerprinted warning and shows nothing red;
 * the classification lives here so no surface re-derives it.
 *
 * - `bridge_unsupported`: the deployment advertises no bridge capability;
 *   discovery stops.
 * - `bridge_no_agent`: the bootstrap asked for a runtime in a space whose
 *   validated agent list is empty; the retry curve resolves it once an agent
 *   exists.
 * - `bridge_state`: the SDK's own retry state (`model_unavailable`: the local
 *   server does not serve the model; `reconnecting`: the native session
 *   dropped); the bridge status surface shows it inline and the SDK retries
 *   on its own curve. The state is the error's message.
 *   The raw answers that lead to those states share the class: the native
 *   bridge failing to reach the relay, a stale renewal the
 *   SDK answers with a fresh session, and a migration the
 *   gateway sends back for a reconnect.
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
  if (
    error instanceof BridgeStateError ||
    isBridgeRelayUnreachable(error) ||
    isStaleBridgeSession(error) ||
    isMigrationReconnect(error)
  )
    return "bridge_state";
  return null;
}
