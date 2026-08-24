import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { config } from "../config";

/**
 * Azure OpenAI endpoint persistence (PRODUCT-1477). Azure is the one pi
 * catalog provider whose base URL is PER-USER — each Azure resource has its
 * own endpoint and pi ships the catalog with `baseUrl: ""` — so a pasted key
 * alone can never make a request. The connect flow collects the endpoint
 * alongside the key; the key rides auth.json like every api-key provider,
 * while the endpoint persists here (its own `azure-endpoint.json`, mirroring
 * `openai-compatible.ts`'s custom-endpoint file) and is overlaid onto every
 * resolved azure model's `baseUrl` (providers.ts `safeGetModel`), which pi's
 * azure client reads when no explicit option or env var names one.
 *
 * Deployment names: pi calls the deployment named EXACTLY like the model id
 * (`resolveDeploymentName`), so a deployment must be named after its model
 * ("gpt-5.5", not "my-gpt"). The connect dialog says so.
 */

/** The provider id as pi's catalog spells it. */
export const AZURE_OPENAI = "azure-openai-responses";

/** The persisted endpoint (never the key — that lives in auth.json). */
interface StoredAzureEndpoint {
  baseUrl?: string;
}

/** The endpoint config's on-disk path, per data dir (pod /data persists it). */
export const azureEndpointFileIn = (dataDir: string) =>
  join(dataDir, "azure-endpoint.json");

function load(dataDir: string = config.dataDir): StoredAzureEndpoint {
  const file = azureEndpointFileIn(dataDir);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as StoredAzureEndpoint;
  } catch {
    return {};
  }
}

/** The stored Azure endpoint URL, or "" when never configured. */
export function azureBaseUrl(dataDir?: string): string {
  return load(dataDir).baseUrl ?? "";
}

/** Azure-owned inference hosts, where the OpenAI v1 surface lives at the
 *  host root (pi appends `/openai/v1` itself). */
const AZURE_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".cognitiveservices.azure.com",
  ".ai.azure.com",
];

/**
 * Validate + normalize a pasted Azure endpoint: a real https URL (the portal
 * always hands out https; http would send the key in the clear). On an
 * Azure-owned host the PATH is dropped: the portal shows several per-resource
 * endpoints — the Foundry tab's is `https://<r>.services.ai.azure.com/api/
 * projects/<p>`, a project surface the OpenAI SDK can't call — while the
 * OpenAI v1 API always hangs off the host root, and pi only appends its
 * `/openai/v1` base path when the pasted path is empty (PRODUCT-1477: the
 * reporting user pasted the Foundry project endpoint, verbatim from the
 * portal, and every request 404'd). A non-Azure host (a proxy, a gateway)
 * keeps its path verbatim.
 * Throws with the user-facing reason — connect routes surface it as a 400.
 */
export function normalizeAzureEndpoint(raw: string): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) throw new Error("missing Azure OpenAI endpoint");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Azure OpenAI endpoint is not a valid URL: ${trimmed}`);
  }
  if (url.protocol !== "https:")
    throw new Error("Azure OpenAI endpoint must start with https://");
  if (AZURE_HOST_SUFFIXES.some((sfx) => url.hostname.endsWith(sfx)))
    return `https://${url.host}`;
  return trimmed.replace(/\/+$/, "");
}

/** Persist the endpoint (validated). Atomic like every config write here. */
export function setAzureEndpoint(raw: string): void {
  const baseUrl = normalizeAzureEndpoint(raw);
  const file = azureEndpointFileIn(config.dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ baseUrl }, null, 2));
  renameSync(tmp, file);
}

/**
 * Overlay the stored endpoint onto a resolved azure catalog model. pi's azure
 * client resolves the base URL as option → env → `model.baseUrl`, and the
 * catalog ships `""` — so without this overlay every request throws "base URL
 * is required" before any HTTP. A model that already carries a base URL (a
 * future pi catalog fix, a test double) is left alone.
 */
export function withAzureBaseUrl(
  model: Model<Api>,
  dataDir?: string,
): Model<Api> {
  if (model.provider !== AZURE_OPENAI || model.baseUrl) return model;
  const baseUrl = azureBaseUrl(dataDir);
  if (!baseUrl) return model;
  return { ...model, baseUrl };
}
