import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { atomicTempPath } from "@houston/protocol";
import { config } from "../config";

export const AZURE_OPENAI = "azure-openai-responses";

interface StoredAzureEndpoint {
  baseUrl?: string;
}

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

export function azureBaseUrl(dataDir?: string): string {
  return load(dataDir).baseUrl ?? "";
}

const AZURE_HOST_SUFFIXES = [
  ".openai.azure.com",
  ".cognitiveservices.azure.com",
  ".ai.azure.com",
];

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

export function setAzureEndpointIn(dataDir: string, raw: string): void {
  const baseUrl = normalizeAzureEndpoint(raw);
  const file = azureEndpointFileIn(dataDir);
  const tmp = atomicTempPath(file);
  writeFileSync(tmp, JSON.stringify({ baseUrl }, null, 2));
  renameSync(tmp, file);
}

export function setAzureEndpoint(raw: string): void {
  setAzureEndpointIn(config.dataDir, raw);
}

export function applyServedAzureEndpoint(
  provider: string,
  endpoint: string | null | undefined,
  dataDir: string = config.dataDir,
): void {
  if (provider !== AZURE_OPENAI || !endpoint) return;
  try {
    if (azureBaseUrl(dataDir) === normalizeAzureEndpoint(endpoint)) return;
    setAzureEndpointIn(dataDir, endpoint);
  } catch (e) {
    console.error(
      `[serve] served azure endpoint is invalid; keeping the stored one: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

export function withAzureBaseUrl(
  model: Model<Api>,
  dataDir?: string,
): Model<Api> {
  if (model.provider !== AZURE_OPENAI || model.baseUrl) return model;
  const baseUrl = azureBaseUrl(dataDir);
  if (!baseUrl) return model;
  return { ...model, baseUrl };
}
