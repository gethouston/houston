import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_MODEL } from "@houston/sdk/provider-catalog";
import {
  isModelVisible,
  PROVIDER_OVERRIDES,
  VISIBLE_MODELS,
} from "../src/lib/provider-overrides.ts";

const codex = (await import(
  new URL("../../packages/runtime/src/ai/codex-offered.ts", import.meta.url)
    .href
)) as {
  CODEX_DEFAULT_MODEL: string;
  CODEX_PICKER_HIDDEN_MODEL_IDS: readonly string[];
  codexOfferedModelIds(catalogIds: readonly string[]): string[];
};

const pi = (await import(
  new URL(
    "../../packages/host/node_modules/@earendil-works/pi-ai/dist/compat.js",
    import.meta.url,
  ).href
)) as { getModels(provider: string): { id: string }[] };

const served = codex
  .codexOfferedModelIds(pi.getModels("openai-codex").map((m) => m.id))
  .sort();

const REFUSED = ["gpt-5.3-codex-spark"];

const HIDDEN_SERVED = codex.CODEX_PICKER_HIDDEN_MODEL_IDS;

describe("Codex model curation matches what the subscription serves", () => {
  it("offers exactly the served ids minus the deliberately hidden ones", () => {
    for (const id of HIDDEN_SERVED) ok(served.includes(id), id);
    deepStrictEqual(
      [...VISIBLE_MODELS.openai].sort(),
      served.filter((id) => !HIDDEN_SERVED.includes(id)),
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
  it("still offers gpt-5.3-codex-spark, gpt-5.4 and gpt-5.4-mini", () => {
    for (const modelId of [...REFUSED, "gpt-5.4", "gpt-5.4-mini"])
      ok(VISIBLE_MODELS["azure-openai-responses"].has(modelId));
  });
});
