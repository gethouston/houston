import { ok } from "node:assert";
import { describe, it } from "node:test";
import {
  PROVIDER_ID_RENAME,
  PROVIDER_OVERRIDES,
  VISIBLE_MODELS,
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
 * `dist/compat.js` (not `dist/index.js`) because pi-ai 0.80 moved the static
 * `getModel`/`getProviders` catalog reads used here onto its legacy `/compat`
 * entrypoint (the new default API is an instantiated `Models`/`Provider`
 * collection this drift check has no need to build).
 */
const pi = (await import(
  new URL(
    "../../packages/host/node_modules/@earendil-works/pi-ai/dist/compat.js",
    import.meta.url,
  ).href
)) as {
  getModel(provider: string, id: string): unknown;
  getProviders(): string[];
};

// The catalog Houston actually serves is pi-ai PLUS the host's backport patches
// (`GET /v1/catalog` imports them), so apply the same patches here before
// checking for orphans — an override for a backported model (moonshotai
// kimi-k3, google gemini-3.6-flash / 3.5-flash-lite) is not drift. Delete each
// with the pi bump that ships it natively.
await import("../../packages/host/src/providers/moonshot-k3-catalog-patch.ts");
await import("../../packages/host/src/providers/gemini-flash-catalog-patch.ts");

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

describe("VISIBLE_MODELS stay in sync with the shipped pi-ai catalog", () => {
  // A curated visible id pi doesn't ship is a silent hole in the picker AND the
  // hub (the model simply never appears); an id typo would hide a model the
  // curation meant to show. Same real-registry read as the overrides guard.
  for (const [houstonId, visible] of Object.entries(VISIBLE_MODELS)) {
    const piId = houstonToPi[houstonId] ?? houstonId;

    for (const modelId of visible) {
      it(`${houstonId}/${modelId} exists in pi-ai`, () => {
        ok(
          pi.getModel(piId, modelId) != null,
          `VISIBLE_MODELS["${houstonId}"] lists "${modelId}", which pi-ai (provider "${piId}") does not ship. Remove it or fix the id.`,
        );
      });
    }
  }
});
