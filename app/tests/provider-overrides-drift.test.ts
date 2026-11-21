import { ok } from "node:assert";
import { describe, it } from "node:test";
import { DEFAULT_MODEL } from "@houston/sdk/provider-catalog";
import {
  isModelVisible,
  PROVIDER_ID_RENAME,
  PROVIDER_OVERRIDES,
  VISIBLE_MODELS,
} from "../src/lib/provider-overrides.ts";

const pi = (await import(
  new URL(
    "../../packages/host/node_modules/@earendil-works/pi-ai/dist/compat.js",
    import.meta.url,
  ).href
)) as {
  getModel(provider: string, id: string): unknown;
  getProviders(): string[];
};

const qwenExtension = (await import(
  new URL(
    "../../packages/host/src/providers/qwen-dashscope.ts",
    import.meta.url,
  ).href
)) as {
  QWEN_PROVIDER_ID: string;
  qwenModels(): { id: string }[];
};

function shippedModel(provider: string, id: string): unknown {
  if (provider === qwenExtension.QWEN_PROVIDER_ID)
    return qwenExtension.qwenModels().find((m) => m.id === id);
  return pi.getModel(provider, id);
}

const houstonToPi: Record<string, string> = {};
for (const [piId, houstonId] of Object.entries(PROVIDER_ID_RENAME))
  houstonToPi[houstonId] = piId;

describe("PROVIDER_OVERRIDES stay in sync with the shipped pi-ai catalog", () => {
  const piProviders = new Set([
    ...pi.getProviders(),
    qwenExtension.QWEN_PROVIDER_ID,
  ]);

  for (const [houstonId, override] of Object.entries(PROVIDER_OVERRIDES)) {
    const piId = houstonToPi[houstonId] ?? houstonId;

    it(`${houstonId} names a provider pi-ai ships`, () => {
      ok(
        piProviders.has(piId),
        `PROVIDER_OVERRIDES["${houstonId}"] maps to pi provider "${piId}", which pi-ai does not ship`,
      );
    });

    for (const modelId of Object.keys(override.models ?? {})) {
      it(`${houstonId}/${modelId} exists in the shipped catalog`, () => {
        ok(
          shippedModel(piId, modelId) != null,
          `PROVIDER_OVERRIDES["${houstonId}"].models["${modelId}"] is an orphan: the shipped catalog (provider "${piId}") has no such model. Remove it or fix the id.`,
        );
      });
    }
  }
});

describe("VISIBLE_MODELS stay in sync with the shipped pi-ai catalog", () => {
  for (const [houstonId, visible] of Object.entries(VISIBLE_MODELS)) {
    const piId = houstonToPi[houstonId] ?? houstonId;

    for (const modelId of visible) {
      it(`${houstonId}/${modelId} exists in the shipped catalog`, () => {
        ok(
          shippedModel(piId, modelId) != null,
          `VISIBLE_MODELS["${houstonId}"] lists "${modelId}", which the shipped catalog (provider "${piId}") does not offer. Remove it or fix the id.`,
        );
      });
    }
  }
});

describe("the domain default model is offered and visible", () => {
  for (const [piId, modelId] of Object.entries(DEFAULT_MODEL)) {
    if (!modelId) continue;
    const houstonId = PROVIDER_ID_RENAME[piId] ?? piId;
    if (!PROVIDER_OVERRIDES[houstonId]) continue;
    it(`${houstonId} default ${modelId} exists in the shipped catalog`, () => {
      ok(
        shippedModel(piId, modelId) != null,
        `DEFAULT_MODEL["${piId}"] = "${modelId}" is not offered by the shipped catalog (provider "${piId}").`,
      );
    });
    it(`${houstonId} default ${modelId} is visible in the picker`, () => {
      ok(
        isModelVisible(houstonId, modelId),
        `DEFAULT_MODEL["${piId}"] = "${modelId}" is hidden by VISIBLE_MODELS["${houstonId}"].`,
      );
    });
  }
});
