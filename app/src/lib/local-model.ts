/** Discovery metadata and display helpers for the local model picker. */
import type { LocalBridgeStatus } from "@houston/sdk";
import type { CustomEndpoint } from "@houston-ai/engine-client";

export type LocalModelKind = "lmstudio" | "jan" | "ollama" | "unknown";
export interface DetectedServer {
  kind: LocalModelKind;
  baseUrl: string;
  port: number;
  models: string[];
  reachable: boolean;
}
export type BridgeStatusKind = LocalBridgeStatus | "offline" | "error";
export interface BridgeStatus {
  status: BridgeStatusKind;
}
export interface SavedBridgeTarget {
  targetBaseUrl: string;
  appName?: string;
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

function localModelApiBase(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

export function buildDirectEndpoint(opts: {
  server: DetectedServer;
  model: string;
  name: string;
  /** Surface the model's chain-of-thought as thinking in Houston. */
  reasoning?: boolean;
  /** Share the endpoint with teammates in the active team workspace. */
  shared?: boolean;
}): CustomEndpoint {
  return {
    baseUrl: localModelApiBase(opts.server.baseUrl),
    model: opts.model,
    name: opts.name,
    ...(opts.reasoning ? { reasoning: true } : {}),
    ...(opts.shared ? { shared: true } : {}),
  };
}
