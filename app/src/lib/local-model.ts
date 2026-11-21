import type { CustomEndpoint } from "@houston/engine-adapter";
import type { LocalBridgeStatus } from "@houston/sdk";

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

export function defaultModelFor(server: DetectedServer): string {
  return server.models[0] ?? "";
}

export function defaultEndpointName(
  kind: LocalModelKind,
  model: string,
): string {
  const app = appDisplayName(kind);
  return model ? `${app} · ${model}` : app;
}

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
  reasoning?: boolean;
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
