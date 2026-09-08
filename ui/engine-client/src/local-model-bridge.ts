import type {
  LocalBridgeDescriptor,
  LocalBridgeDevice,
  LocalBridgeIdentity,
  LocalBridgeRegister,
  LocalBridgeRemoteStatus,
  LocalBridgeSession,
} from "@houston/protocol";
import type { CustomEndpoint } from "./types";

/** All operations remain bound to the identity captured when access was opened. */
export interface LocalModelBridgeAccess {
  identity: LocalBridgeIdentity;
  register(
    input: LocalBridgeRegister,
    signal?: AbortSignal,
  ): Promise<LocalBridgeDescriptor>;
  session(
    id: string,
    device: LocalBridgeDevice,
    signal?: AbortSignal,
    generation?: number,
  ): Promise<LocalBridgeSession>;
  status(id: string, signal?: AbortSignal): Promise<LocalBridgeRemoteStatus>;
  revoke(id: string, signal?: AbortSignal): Promise<void>;
  saveEndpoint(endpoint: CustomEndpoint, signal?: AbortSignal): Promise<void>;
  clearEndpoint(signal?: AbortSignal): Promise<void>;
  legacyEndpoint(signal?: AbortSignal): Promise<CustomEndpoint | null>;
}
