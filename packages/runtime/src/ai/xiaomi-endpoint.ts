import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { XIAOMI_TOKEN_PLAN_SGP_MODELS } from "@earendil-works/pi-ai/providers/xiaomi-token-plan-sgp.models";
import { config } from "../config";

/**
 * Xiaomi MiMo's persisted endpoint choice. Xiaomi runs TWO key families on
 * distinct hosts: a pay-as-you-go key (`sk-…`) authenticates only on the
 * general endpoint, while a purchased Token Plan mints a dedicated key
 * (`tp-…`) that authenticates ONLY on its plan's regional gateway — the
 * general endpoint answers 401 for it (verified live: a Token Plan key got
 * 200s on token-plan-sgp and "didn't accept this key" through Houston).
 * Houston surfaces ONE "Xiaomi MiMo" card (the three regional Token Plan
 * cards were dropped from the picker, 2026-07 provider QA), so the verify
 * probe tries every endpoint and persists the accepting one here — beside
 * settings.json so it syncs with it — and every xiaomi model read overlays
 * it. Same shape as qwen's region file (`qwen-region.ts`, HOU-1077).
 */

export const XIAOMI_PROVIDER_ID = "xiaomi";

export interface XiaomiEndpoint {
  id: string;
  baseUrl: string;
}

/**
 * Every endpoint a pasted key may belong to, in default probe order: the
 * general (pay-as-you-go) endpoint first, then the Token Plan gateways —
 * Singapore (Xiaomi's international default) before Amsterdam and China.
 * URLs mirror pi-ai's `xiaomi` / `xiaomi-token-plan-*` catalogs.
 */
export const XIAOMI_ENDPOINTS: readonly XiaomiEndpoint[] = [
  { id: "general", baseUrl: "https://api.xiaomimimo.com/v1" },
  { id: "token-plan-sgp", baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1" },
  { id: "token-plan-ams", baseUrl: "https://token-plan-ams.xiaomimimo.com/v1" },
  { id: "token-plan-cn", baseUrl: "https://token-plan-cn.xiaomimimo.com/v1" },
];

const DEFAULT_ENDPOINT = XIAOMI_ENDPOINTS[0];

/**
 * Probe order for a candidate key. Token Plan keys carry the `tp-` prefix
 * (general keys are `sk-`), so a `tp-` key starts on the plan gateways and
 * saves the guaranteed-401 round trip to the general endpoint. Ordering
 * only — a key of either shape is still probed everywhere before a verdict.
 */
export function xiaomiProbeOrder(key: string): readonly XiaomiEndpoint[] {
  if (!key.startsWith("tp-")) return XIAOMI_ENDPOINTS;
  return [
    ...XIAOMI_ENDPOINTS.filter((e) => e.id !== DEFAULT_ENDPOINT.id),
    DEFAULT_ENDPOINT,
  ];
}

/** The persisted endpoint choice — beside settings.json so it syncs with it. */
export const xiaomiEndpointFileIn = (dataDir: string) =>
  join(dataDir, "xiaomi-endpoint.json");

/** The endpoint the stored key verified against, defaulting to general. */
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

/**
 * Persist the endpoint a key verified against into an arbitrary data dir —
 * the dataDir-bound twin a pool worker uses against a hydrated agent root
 * (op-credential.ts). Atomic like every config write here.
 */
export function setXiaomiEndpointIn(dataDir: string, endpointId: string): void {
  const endpoint = XIAOMI_ENDPOINTS.find((e) => e.id === endpointId);
  if (!endpoint) throw new Error(`unknown xiaomi endpoint: ${endpointId}`);
  const file = xiaomiEndpointFileIn(dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ endpoint: endpoint.id }, null, 2));
  renameSync(tmp, file);
}

/** Persist into the live runtime's data dir (the verify flow's default). */
export function setXiaomiEndpoint(endpointId: string): void {
  setXiaomiEndpointIn(config.dataDir, endpointId);
}

/**
 * Overlay the verified endpoint onto a resolved xiaomi catalog model. pi's
 * catalog bakes the GENERAL base URL into every xiaomi model, so without
 * this a Token Plan key chats against the endpoint that rejects it. Unlike
 * the azure overlay this is unconditional: the catalog URL is exactly what a
 * token-plan connect must replace.
 */
export function withXiaomiBaseUrl(
  model: Model<Api>,
  dataDir?: string,
): Model<Api> {
  if (model.provider !== XIAOMI_PROVIDER_ID) return model;
  const { baseUrl } = activeXiaomiEndpoint(dataDir);
  if (model.baseUrl === baseUrl) return model;
  return { ...model, baseUrl };
}

/**
 * Narrow a xiaomi model-id list to what the ACTIVE endpoint actually serves.
 * The Token Plan gateways offer a subset of the general catalog (no
 * `mimo-v2.5-pro-ultraspeed`), derived from pi's own token-plan table — the
 * regional catalogs are identical, so Singapore stands for all three — so a
 * plan user is never offered a model their endpoint 404s.
 */
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
