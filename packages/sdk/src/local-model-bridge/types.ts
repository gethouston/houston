import type {
  CustomEndpoint,
  LocalBridgeDescriptor,
  LocalBridgeDevice,
  LocalBridgeIdentity,
  LocalBridgeRegister,
  LocalBridgeRemoteStatus,
  LocalBridgeSession,
} from "@houston/protocol";

export type LocalBridgeStatus =
  | "disabled"
  | "connecting"
  | "online"
  | "reconnecting"
  | "model_unavailable"
  | "authorization_required"
  | "revoked"
  | "reconnect_required";
export interface LocalBridgeSnapshot {
  journal: LocalBridgeJournal | null;
  status: LocalBridgeStatus;
  descriptor?: LocalBridgeDescriptor;
  generation?: number;
  sessionExpiresAt?: string;
}
export interface LocalBridgeConnectInput {
  targetBaseUrl: string;
  appName?: string;
  model: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
  shared?: boolean;
  localApiKey?: string;
  legacy?: LocalBridgeRegister["legacy"];
}
export interface LocalBridgeJournal {
  version: 1;
  identity: LocalBridgeIdentity;
  idempotencyKey: string;
  migration?: true;
  phase: "prepared" | "registered" | "ready" | "committed";
  input: Omit<LocalBridgeConnectInput, "localApiKey" | "legacy">;
  descriptor?: LocalBridgeDescriptor;
}
export interface LocalBridgeManagementPort {
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
  legacyEndpoint(signal?: AbortSignal): Promise<CustomEndpoint | null>;
  clearEndpoint(signal?: AbortSignal): Promise<void>;
  saveEndpoint(endpoint: CustomEndpoint, signal?: AbortSignal): Promise<void>;
}
export interface LocalBridgeNativeEvent {
  bridgeId: string;
  generation: number;
  status: LocalBridgeStatus;
  sessionExpiresAt?: string;
}
export interface LocalBridgeNativePort {
  legacyCandidate(identity: LocalBridgeIdentity): Promise<{
    targetBaseUrl: string;
    proxyKey: string;
    appName: string;
    localApiKey?: string;
  } | null>;
  completeMigration(identity: LocalBridgeIdentity): Promise<void>;
  device(identity: LocalBridgeIdentity): Promise<LocalBridgeDevice>;
  start(input: {
    identity: LocalBridgeIdentity;
    bridgeId: string;
    connectUrl: string;
    ticket: string;
    targetBaseUrl: string;
    model: string;
    localApiKey?: string;
  }): Promise<{ generation: number; sessionExpiresAt: string }>;
  renew(ticket: string): Promise<void>;
  stop(): Promise<void>;
  subscribe(listener: (event: LocalBridgeNativeEvent) => void): () => void;
}
export interface LocalBridgeStoragePort {
  load(identity: LocalBridgeIdentity): Promise<LocalBridgeJournal | null>;
  save(
    identity: LocalBridgeIdentity,
    journal: LocalBridgeJournal,
  ): Promise<void>;
  clear(identity: LocalBridgeIdentity): Promise<void>;
}
export interface LocalModelBridgePorts {
  management: LocalBridgeManagementPort;
  native: LocalBridgeNativePort;
  storage: LocalBridgeStoragePort;
  report(error: unknown): void;
  random?: () => number;
  now?: () => number;
}
