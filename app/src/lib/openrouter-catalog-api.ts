import type { OpenRouterCatalogModel } from "@houston-ai/engine-client";
import { getEngine } from "./engine";

export async function fetchOpenRouterCatalog(query?: string): Promise<OpenRouterCatalogModel[]> {
  return getEngine().listOpenRouterModels(query);
}

/** Probe the stored key by listing models. Surfaces auth errors to the caller. */
export async function verifyOpenRouterApiKey(): Promise<OpenRouterCatalogModel[]> {
  return fetchOpenRouterCatalog();
}
