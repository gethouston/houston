import { ok } from "node:assert";
import { describe, it } from "node:test";
import {
  PROVIDER_ID_RENAME,
  PROVIDER_OVERRIDES,
} from "../src/lib/provider-overrides.ts";

/**
 * Drift guard: every model id a `PROVIDER_OVERRIDES` entry curates must actually
 * exist in the pi-ai catalog Houston ships. Overrides only add presentation
 * metadata (labels, descriptions, and — for a genuine cap — effort) layered onto
 * pi's runnable model set; an id pi doesn't ship is an ORPHAN that never renders
 * (the `claude-sonnet-5` override was exactly this bug, hidden because the unit
 * tests fed a synthetic catalog). This test reads the REAL pi-ai registry so a
 * new orphan can't slip in.
 *
 * pi-ai isn't an app dependency, so we resolve it through the host package (which
 * depends on it) via its stable node_modules symlink — no lockfile change, and
 * the app's `node --experimental-strip-types --test` runner imports it directly.
 */
const pi = (await import(
  new URL(
    "../../packages/host/node_modules/@earendil-works/pi-ai/dist/index.js",
    import.meta.url,
  ).href
)) as {
  getModel(provider: string, id: string): unknown;
  getProviders(): string[];
};

// Houston provider id → pi provider id (reverse of PROVIDER_ID_RENAME, which is
// pi → Houston, e.g. `openai-codex` → `openai`). Identity for every other id.
const houstonToPi: Record<string, string> = {};
for (const [piId, houstonId] of Object.entries(PROVIDER_ID_RENAME))
  houstonToPi[houstonId] = piId;

describe("PROVIDER_OVERRIDES stay in sync with the shipped pi-ai catalog", () => {
  const piProviders = new Set(pi.getProviders());

  for (const [houstonId, override] of Object.entries(PROVIDER_OVERRIDES)) {
    const piId = houstonToPi[houstonId] ?? houstonId;

    it(`${houstonId} names a provider pi-ai ships`, () => {
      ok(
        piProviders.has(piId),
        `PROVIDER_OVERRIDES["${houstonId}"] maps to pi provider "${piId}", which pi-ai does not ship`,
      );
    });

    for (const modelId of Object.keys(override.models ?? {})) {
      it(`${houstonId}/${modelId} exists in pi-ai`, () => {
        ok(
          pi.getModel(piId, modelId) != null,
          `PROVIDER_OVERRIDES["${houstonId}"].models["${modelId}"] is an orphan: pi-ai (provider "${piId}") ships no such model. Remove it or fix the id.`,
        );
      });
    }
  }
});
