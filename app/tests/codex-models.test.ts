import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MODEL } from "@houston/sdk/provider-catalog";
import {
  isModelVisible,
  PROVIDER_OVERRIDES,
  VISIBLE_MODELS,
} from "../src/lib/provider-overrides.ts";

/**
 * Codex (pi `openai-codex`, Houston `openai`) may offer ONLY what OpenAI's
 * Codex backend serves a ChatGPT subscription. pi-ai's baked catalog is a
 * SUPERSET of that: it still lists gpt-5.5 (`404 model_not_found`) and gpt-5.4
 * (`400 not supported when using Codex with a ChatGPT account`), so picking
 * either can only produce a dead turn — and gpt-5.5 was the app's Codex default
 * until this guard, i.e. the model every fresh Codex chat started on.
 *
 * `packages/runtime/src/ai/codex-offered.ts` is the documented source (it holds
 * the live probe, the verdicts and the re-verify recipe). This pins BOTH app
 * Codex surfaces to it — the curated visible set and the auto-selected default
 * — so the app can never drift from the runtime's table, and a pi catalog bump
 * that adds a Codex row fails here until someone curates it deliberately.
 *
 * Both modules are read through relative URLs (neither is an app dependency),
 * exactly like `provider-overrides-drift.test.ts` reads the shipped pi-ai
 * catalog through the host's node_modules.
 */
const codex = (await import(
  new URL("../../packages/runtime/src/ai/codex-offered.ts", import.meta.url)
    .href
)) as {
  CODEX_DEFAULT_MODEL: string;
  codexOfferedModelIds(catalogIds: readonly string[]): string[];
};

const pi = (await import(
  new URL(
    "../../packages/host/node_modules/@earendil-works/pi-ai/dist/compat.js",
    import.meta.url,
  ).href
)) as { getModels(provider: string): { id: string }[] };

/** The ids the subscription actually runs: pi's Codex catalog minus the refusals. */
const served = codex
  .codexOfferedModelIds(pi.getModels("openai-codex").map((m) => m.id))
  .sort();

/** Probed refusals — neither may ever reach a Codex picker or default again. */
const REFUSED = ["gpt-5.4", "gpt-5.5"];

describe("Codex model curation matches what the subscription serves", () => {
  it("offers exactly the served ids, no more and no fewer", () => {
    deepStrictEqual(
      [...VISIBLE_MODELS.openai].sort(),
      served,
      "VISIBLE_MODELS.openai has drifted from codexOfferedModelIds(pi's openai-codex catalog): re-curate it (and check codex-offered.ts is still accurate).",
    );
  });

  for (const modelId of REFUSED) {
    it(`hides ${modelId}, which the Codex backend refuses`, () => {
      strictEqual(isModelVisible("openai", modelId), false);
    });
  }

  it("curates presentation metadata only for served ids", () => {
    for (const modelId of Object.keys(PROVIDER_OVERRIDES.openai.models ?? {}))
      ok(
        served.includes(modelId),
        `PROVIDER_OVERRIDES.openai.models["${modelId}"] labels a model the ChatGPT subscription does not serve.`,
      );
  });
});

describe("the Codex default is the runtime's default", () => {
  it("matches CODEX_DEFAULT_MODEL", () => {
    strictEqual(DEFAULT_MODEL["openai-codex"], codex.CODEX_DEFAULT_MODEL);
  });

  it("is a model the picker shows", () => {
    ok(isModelVisible("openai", codex.CODEX_DEFAULT_MODEL));
  });
});

describe("Azure OpenAI keeps the rows Codex refuses", () => {
  it("still offers gpt-5.5 and gpt-5.4", () => {
    // The refusals are a property of the CHATGPT SUBSCRIPTION, not of the
    // models: an Azure request hits the user's own resource and runs whatever
    // they deployed there. Pinned so the Codex curation is never mirrored onto
    // Azure by a future sweep.
    for (const modelId of REFUSED)
      ok(VISIBLE_MODELS["azure-openai-responses"].has(modelId));
  });
});
