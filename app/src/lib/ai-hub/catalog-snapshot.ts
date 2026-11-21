import snapshot from "./model-catalog.json" with { type: "json" };

export interface RawModel {
  key: string;
  id: string;
  name: string;
  description?: string;
  family?: string;
  reasoning?: boolean;
  toolCall?: boolean;
  imageGen?: boolean;
  attachment?: boolean;
  knowledge?: string;
  releaseDate?: string;
  input?: string[];
  context?: number;
  output?: number;
  costIn?: number;
  costOut?: number;
}

export interface RawCatalog {
  generatedAt: string;
  providers: Record<string, { models: RawModel[] }>;
}

export function snapshotModels(): RawModel[] {
  const cat = snapshot as RawCatalog;
  return Object.values(cat.providers).flatMap((p) => p.models);
}
