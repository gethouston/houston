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

/** A model entry as written by `scripts/generate-model-catalog.mjs`. */
export interface RawModel {
  /** Cross-provider normalized identity key (baked at generation). */
  key: string;
  id: string;
  name: string;
  description?: string;
  family?: string;
  reasoning?: boolean;
  toolCall?: boolean;
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

/** The baked snapshot, parsed once (module singleton). */
export function loadRawCatalog(): Promise<RawCatalog> {
  return Promise.resolve(snapshot as RawCatalog);
}
