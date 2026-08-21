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

/**
 * Validate + normalize a pasted Azure endpoint: a real https URL (the portal
 * always hands out https; http would send the key in the clear), with any
 * trailing slash trimmed so pi's own base-URL normalization starts clean.
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
