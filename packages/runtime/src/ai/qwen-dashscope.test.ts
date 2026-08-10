import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { isPiOAuthProvider, isPiProvider, piModelIds } from "./pi-catalog";
import { modelFor, providerAuthMethod, safeGetModel } from "./providers";
import {
  activeQwenRegion,
  ensureQwenRuntimeProvider,
  QWEN_PROVIDER_ID,
  QWEN_REGIONS,
  qwenModel,
  qwenModels,
  qwenRegionFileIn,
  resolveQwenModel,
} from "./qwen-dashscope";

// Houston's qwen extension provider (HOU-1077): Qwen on Alibaba Model Studio's
// international PAY-AS-YOU-GO endpoints, for the regular (free-quota) keys the
// pi-shipped Token Plan gateways reject. The models are derived from pi's own
// qwen-token-plan catalog, so these tests pin the derivation contract, not a
// hand-copied model list. The endpoint is REGION-scoped per verified key
// (qwen-region.json); Singapore is the never-verified default.

const INTL = QWEN_REGIONS[0];
const US = QWEN_REGIONS[1];

function dirWithRegion(regionId: string): string {
  const dir = mkdtempSync(join(tmpdir(), "houston-qwen-region-"));
  writeFileSync(
    qwenRegionFileIn(dir),
    JSON.stringify({ region: regionId }, null, 2),
  );
  return dir;
}

test("qwen models are the Token Plan Qwen entries on the DashScope url", () => {
  const models = qwenModels();
  expect(models.length).toBeGreaterThan(0);
  for (const m of models) {
    expect(m.id.startsWith("qwen")).toBe(true);
    expect(m.provider).toBe(QWEN_PROVIDER_ID);
    expect(m.baseUrl).toBe(INTL.baseUrl);
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
  expect(m?.baseUrl).toBe(INTL.baseUrl);
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

// ---------------------------------------------------------------------------
// Region scoping (HOU-1077): a key works only against the Model Studio region
// it was created in, so the verified region persists per data dir and every
// model read serves it.

test("no region file → the Singapore default", () => {
  const dir = mkdtempSync(join(tmpdir(), "houston-qwen-region-"));
  expect(activeQwenRegion(dir).id).toBe("intl");
  expect(qwenModels(dir)[0]?.baseUrl).toBe(INTL.baseUrl);
});

test("a persisted US region flips every model to the US endpoint", () => {
  const dir = dirWithRegion("us");
  expect(activeQwenRegion(dir).id).toBe("us");
  for (const m of qwenModels(dir)) expect(m.baseUrl).toBe(US.baseUrl);
});

test("an unknown/corrupt region file falls back to the default, never throws", () => {
  const dir = dirWithRegion("mars");
  expect(activeQwenRegion(dir).id).toBe("intl");
  const corrupt = mkdtempSync(join(tmpdir(), "houston-qwen-region-"));
  writeFileSync(qwenRegionFileIn(corrupt), "not json");
  expect(activeQwenRegion(corrupt).id).toBe("intl");
});

test("resolveQwenModel keeps safeGetModel semantics with the dir's region", () => {
  const dir = dirWithRegion("us");
  expect(resolveQwenModel("qwen3.7-max", false, dir).baseUrl).toBe(US.baseUrl);
  // Stale saved id → default with a diagnostic; pinned id → clean throw.
  expect(resolveQwenModel("stale-id", false, dir).id).toBe("qwen3.7-max");
  expect(() => resolveQwenModel("stale-id", true, dir)).toThrow(
    /not available/,
  );
});

test("ensureQwenRuntimeProvider registers dispatch with the dir's region", () => {
  const dir = dirWithRegion("us");
  const calls: Array<[string, { baseUrl?: string; api?: string }]> = [];
  ensureQwenRuntimeProvider(
    { registerProvider: (id, config) => calls.push([id, config]) },
    dir,
  );
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe(QWEN_PROVIDER_ID);
  expect(calls[0][1].baseUrl).toBe(US.baseUrl);
  expect(calls[0][1].api).toBe("openai-completions");
});
