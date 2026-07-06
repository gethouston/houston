/**
 * Pure types + helpers for the guided "connect a local model" flow.
 *
 * DOM-free and Tauri-free so it unit-tests under bare Node
 * (`app/tests/local-model.test.ts`). The Tauri IPC lives in `os-bridge.ts`; the
 * connect/disconnect orchestration in `hooks/use-local-model-connect.ts`.
 *
 * The flow lets a NON-technical user point their CLOUD Houston agent at a model
 * server running on their own machine (LM Studio / Jan / Ollama): the desktop
 * detects the local server, mints a relay credential from the gateway, starts an
 * frpc bridge, and registers the resulting public URL as the agent's provider
 * endpoint.
 */

import type {
  CustomEndpoint,
  TunnelCredentials,
} from "@houston-ai/engine-client";

/** The local model apps Houston can auto-detect. `unknown` = a reachable
 *  OpenAI-compatible server we couldn't fingerprint. */
export type LocalModelKind = "lmstudio" | "jan" | "ollama" | "unknown";

/** How the frpc bridge reaches the relay. */
export type BridgeTransport = "wss" | "tcp";

/** One local model server the desktop found (contract: `detect_local_models`). */
export interface DetectedServer {
  kind: LocalModelKind;
  baseUrl: string;
  port: number;
  models: string[];
  reachable: boolean;
}

/** Arguments to `start_local_bridge` (contract A). */
export interface StartBridgeArgs {
  targetBaseUrl: string;
  relayHost: string;
  relayPort: number;
  subdomain: string;
  token: string;
  transport: string;
  /** The local app's display name (e.g. "LM Studio"), persisted with the saved
   *  target so the offline hint can name it after a restart. */
  appName?: string;
}

/** Result of `start_local_bridge` (contract A). */
export interface StartBridgeResult {
  publicUrl: string;
  localProxyPort: number;
  proxyKey: string;
}

/**
 * The bridge target this machine has persisted (contract: `saved_bridge_target`).
 * Non-null iff THIS machine set up and owns a local-model tunnel. `null` for a
 * direct/manual endpoint or a tunnel another machine manages.
 */
export interface SavedBridgeTarget {
  targetBaseUrl: string;
  transport: BridgeTransport;
  /** The local app's display name for the offline hint (e.g. "LM Studio"). */
  appName?: string;
}

/**
 * Arguments to `reconnect_local_bridge` (contract): re-establish frpc for the
 * saved target, reusing the persisted `proxyKey` so the already-registered cloud
 * endpoint stays valid (no re-registration needed).
 */
export interface ReconnectBridgeArgs {
  relayHost: string;
  relayPort: number;
  subdomain: string;
  token: string;
}

/** Live state of the local bridge (contract: `local_bridge_status` +
 *  the `local-bridge-status` Tauri event). */
export type BridgeStatusKind = "online" | "offline" | "connecting" | "error";
export interface BridgeStatus {
  status: BridgeStatusKind;
  detail?: string;
}

/** Brand display name for a detected app. Brand names never translate. */
export function appDisplayName(kind: LocalModelKind): string {
  switch (kind) {
    case "lmstudio":
      return "LM Studio";
    case "jan":
      return "Jan";
    case "ollama":
      return "Ollama";
    default:
      return "Local model";
  }
}

/** The model to preselect for a server: its first advertised model, else "". */
export function defaultModelFor(server: DetectedServer): string {
  return server.models[0] ?? "";
}

/** A friendly default endpoint name, e.g. "LM Studio · llama3.1". No em dash. */
export function defaultEndpointName(
  kind: LocalModelKind,
  model: string,
): string {
  const app = appDisplayName(kind);
  return model ? `${app} · ${model}` : app;
}

/** Only the servers Houston can actually connect to (reachable + at least one
 *  model). A detected-but-unreachable server is shown as guidance, not a pick. */
export function connectableServers(
  servers: readonly DetectedServer[],
): DetectedServer[] {
  return servers.filter((s) => s.reachable && s.models.length > 0);
}

/**
 * Build the agent's provider endpoint from a started bridge. The runtime speaks
 * OpenAI-compatible at `${publicUrl}/v1`; `proxyKey` is the bearer the local auth
 * proxy enforces so only Houston's tunnel can reach the user's machine.
 */
export function buildLocalEndpoint(opts: {
  publicUrl: string;
  model: string;
  name: string;
  proxyKey: string;
}): CustomEndpoint {
  return {
    baseUrl: `${opts.publicUrl.replace(/\/+$/, "")}/v1`,
    model: opts.model,
    name: opts.name,
    apiKey: opts.proxyKey,
  };
}

/**
 * Map fresh tunnel credentials onto the `reconnect_local_bridge` arguments. The
 * public URL / target are already persisted native-side, so reconnect only needs
 * the relay coordinates + a fresh token.
 */
export function reconnectBridgeArgs(
  cred: TunnelCredentials,
): ReconnectBridgeArgs {
  return {
    relayHost: cred.relayHost,
    relayPort: cred.relayPort,
    subdomain: cred.subdomain,
    token: cred.token,
  };
}

/**
 * Whether THIS session owns (or owned) a local-model bridge, and so should see
 * the tunnel status pill instead of the standard connected indicator.
 *
 * True when this machine has a saved bridge target (a tunnel it manages, even if
 * frpc is currently down after a restart) OR a bridge is currently active. A
 * connected openai-compatible provider with neither is a direct/manual endpoint
 * (or a tunnel another machine owns) and must read as normally connected, never
 * as a scary "Not reachable" pill.
 */
export function sessionOwnsBridge(
  savedTarget: SavedBridgeTarget | null,
  status: BridgeStatus | null,
): boolean {
  if (savedTarget) return true;
  return status != null && status.status !== "offline";
}
