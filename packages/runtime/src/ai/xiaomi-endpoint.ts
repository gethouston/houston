import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { XIAOMI_TOKEN_PLAN_SGP_MODELS } from "@earendil-works/pi-ai/providers/xiaomi-token-plan-sgp.models";
import { atomicTempPath } from "@houston/protocol";
import { config } from "../config";

export const XIAOMI_PROVIDER_ID = "xiaomi";

export interface XiaomiEndpoint {
  id: string;
  baseUrl: string;
}

export const XIAOMI_ENDPOINTS: readonly XiaomiEndpoint[] = [
  { id: "general", baseUrl: "https://api.xiaomimimo.com/v1" },
  { id: "token-plan-sgp", baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1" },
  { id: "token-plan-ams", baseUrl: "https://token-plan-ams.xiaomimimo.com/v1" },
  { id: "token-plan-cn", baseUrl: "https://token-plan-cn.xiaomimimo.com/v1" },
];

const DEFAULT_ENDPOINT = XIAOMI_ENDPOINTS[0];

export function xiaomiProbeOrder(key: string): readonly XiaomiEndpoint[] {
  if (!key.startsWith("tp-")) return XIAOMI_ENDPOINTS;
  return [
    ...XIAOMI_ENDPOINTS.filter((e) => e.id !== DEFAULT_ENDPOINT.id),
    DEFAULT_ENDPOINT,
  ];
}

export const xiaomiEndpointFileIn = (dataDir: string) =>
  join(dataDir, "xiaomi-endpoint.json");

export function activeXiaomiEndpoint(
  dataDir: string = config.dataDir,
): XiaomiEndpoint {
  const file = xiaomiEndpointFileIn(dataDir);
  if (!existsSync(file)) return DEFAULT_ENDPOINT;
  try {
    const { endpoint } = JSON.parse(readFileSync(file, "utf8")) as {
      endpoint?: string;
    };
    return XIAOMI_ENDPOINTS.find((e) => e.id === endpoint) ?? DEFAULT_ENDPOINT;
  } catch {
    return DEFAULT_ENDPOINT;
  }
}

export function setXiaomiEndpointIn(dataDir: string, endpointId: string): void {
  const endpoint = XIAOMI_ENDPOINTS.find((e) => e.id === endpointId);
  if (!endpoint) throw new Error(`unknown xiaomi endpoint: ${endpointId}`);
  const file = xiaomiEndpointFileIn(dataDir);
  const tmp = atomicTempPath(file);
  writeFileSync(tmp, JSON.stringify({ endpoint: endpoint.id }, null, 2));
  renameSync(tmp, file);
}

export function setXiaomiEndpoint(endpointId: string): void {
  setXiaomiEndpointIn(config.dataDir, endpointId);
}

export function withXiaomiBaseUrl(
  model: Model<Api>,
  dataDir?: string,
): Model<Api> {
  if (model.provider !== XIAOMI_PROVIDER_ID) return model;
  const { baseUrl } = activeXiaomiEndpoint(dataDir);
  if (model.baseUrl === baseUrl) return model;
  return { ...model, baseUrl };
}

export function xiaomiOfferedModelIds(
  allIds: string[],
  dataDir?: string,
): string[] {
  if (activeXiaomiEndpoint(dataDir).id === DEFAULT_ENDPOINT.id) return allIds;
  const offered = new Set(
    Object.values(
      XIAOMI_TOKEN_PLAN_SGP_MODELS as Record<string, Model<Api>>,
    ).map((m) => m.id),
  );
  return allIds.filter((id) => offered.has(id));
}
