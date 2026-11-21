export interface CatalogModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface CatalogModelEntry {
  id: string;
  name: string;
  pricing: CatalogModelPricing;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  vision: boolean;
  thinkingLevels?: string[];
  runsAs?: string;
}

export interface CatalogProvider {
  id: string;
  name: string;
  auth: "oauth" | "apiKey";
  models: CatalogModelEntry[];
  pin?: CatalogProviderPin;
}

export interface CatalogProviderPin {
  name?: string;
  models: CatalogSpokenModel[];
}

export interface CatalogSpokenModel {
  id: string;
  name: string;
}

export type ProviderCatalog = CatalogProvider[];
