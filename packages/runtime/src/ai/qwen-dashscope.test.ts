import { expect, test } from "vitest";
import { isPiOAuthProvider, isPiProvider, piModelIds } from "./pi-catalog";
import { modelFor, providerAuthMethod, safeGetModel } from "./providers";
import {
  ensureQwenRuntimeProvider,
  QWEN_BASE_URL,
  QWEN_PROVIDER_ID,
  qwenModel,
  qwenModels,
} from "./qwen-dashscope";

// Houston's qwen extension provider (HOU-1077): Qwen on Alibaba Model Studio's
// international PAY-AS-YOU-GO endpoint, for the regular (free-quota) keys the
// pi-shipped Token Plan gateways reject. The models are derived from pi's own
// qwen-token-plan catalog, so these tests pin the derivation contract, not a
// hand-copied model list.

test("qwen models are the Token Plan Qwen entries on the DashScope url", () => {
  const models = qwenModels();
  expect(models.length).toBeGreaterThan(0);
  for (const m of models) {
    expect(m.id.startsWith("qwen")).toBe(true);
    expect(m.provider).toBe(QWEN_PROVIDER_ID);
    expect(m.baseUrl).toBe(QWEN_BASE_URL);
    expect(m.api).toBe("openai-completions");
  }
});

test("qwen3.7-max is the first (default) model", () => {
  // `firstCatalogModel` picks index 0 as the provider default — a card named
  // Qwen must not default to something else by alphabetical accident.
  expect(qwenModels()[0]?.id).toBe("qwen3.7-max");
  expect(modelFor(QWEN_PROVIDER_ID)).toBe("qwen3.7-max");
});

test("the extension provider reads like a pi builtin everywhere", () => {
  expect(isPiProvider(QWEN_PROVIDER_ID)).toBe(true);
  expect(isPiOAuthProvider(QWEN_PROVIDER_ID)).toBe(false);
  expect(providerAuthMethod(QWEN_PROVIDER_ID)).toBe("apiKey");
  expect(piModelIds(QWEN_PROVIDER_ID)).toContain("qwen3.7-max");
});

test("safeGetModel resolves qwen models and validates pins", () => {
  const m = safeGetModel(QWEN_PROVIDER_ID, "qwen3.7-max", false);
  expect(m?.id).toBe("qwen3.7-max");
  expect(m?.baseUrl).toBe(QWEN_BASE_URL);
  expect(qwenModel("qwen3.7-max")?.id).toBe("qwen3.7-max");
  expect(qwenModel("nope")).toBeUndefined();
  expect(() => safeGetModel(QWEN_PROVIDER_ID, "nope", true)).toThrow(
    /not available/,
  );
});

test("an unknown unpinned id falls back to the qwen default, not undefined", () => {
  const m = safeGetModel(QWEN_PROVIDER_ID, "stale-id", false);
  expect(m?.id).toBe("qwen3.7-max");
});

test("ensureQwenRuntimeProvider registers dispatch for the provider id", () => {
  const calls: Array<[string, { baseUrl?: string; api?: string }]> = [];
  ensureQwenRuntimeProvider({
    registerProvider: (id, config) => calls.push([id, config]),
  });
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe(QWEN_PROVIDER_ID);
  expect(calls[0][1].baseUrl).toBe(QWEN_BASE_URL);
  expect(calls[0][1].api).toBe("openai-completions");
});
