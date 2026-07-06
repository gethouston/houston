/**
 * The baked `model-catalog.json` snapshot shape and its loader. Internal to the
 * catalog build (see `catalog.ts`); not part of the hub's public API.
 *
 * A static JSON import (with the `type: json` attribute Node requires and vite
 * accepts) matches the app's other bundled-JSON imports and, unlike a dynamic
 * `import(...)`, works in the browser: vite serves the snapshot as a JS module,
 * which a dynamic JSON import rejects on a MIME-type check. The module graph
 * makes the parse a singleton, so no manual memoization is needed.
 */

import snapshot from "./model-catalog.json" with { type: "json" };

/**
 * A model entry as written by `scripts/generate-model-catalog.mjs`.
 *
 * This is also the internal carrier the pi-ai mapper (`catalog-pi.ts`) emits, so
 * pi-derived candidates flow through the SAME merge primitives as the snapshot.
 * The pi mapper fills the runnable facts (id/name/pricing/context/reasoning/
 * vision); the snapshot supplies only the enrichment metadata pi can't
 * (`description`/`toolCall`/`imageGen`/`knowledge`/`releaseDate`).
 */
export interface RawModel {
  /** Cross-provider normalized identity key (baked at generation). */
  key: string;
  id: string;
  name: string;
  description?: string;
  family?: string;
  reasoning?: boolean;
  toolCall?: boolean;
  /**
   * The model generates images. Never present in the baked snapshot (models.dev
   * has no such signal), so it stays `false` for every catalog model today; the
   * field is kept because the merge threads it through as an enrichment gap.
   */
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

/**
 * Every baked snapshot model, flattened across providers. Used only as the
 * OPTIONAL enrichment source for the pi-ai catalog: matched by `key`, a snapshot
 * model fills metadata gaps on a pi-ai model that already exists. Snapshot models
 * with no pi-ai twin never surface (see `foldEnrichment`). Module singleton.
 */
export function snapshotModels(): RawModel[] {
  const cat = snapshot as RawCatalog;
  return Object.values(cat.providers).flatMap((p) => p.models);
}
