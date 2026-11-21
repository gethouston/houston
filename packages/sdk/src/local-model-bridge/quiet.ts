import {
  BridgeStateError,
  isBridgeRelayUnreachable,
  isMigrationReconnect,
  isStaleBridgeSession,
} from "@houston/sdk/local-model-bridge/errors";
import { isBridgeUnsupported } from "@houston/sdk/local-model-bridge/unsupported";
import { NoAgentForProviderWriteError } from "@houston/sdk/no-agent-provider-write-error";

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
