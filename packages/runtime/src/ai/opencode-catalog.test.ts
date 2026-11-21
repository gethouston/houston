import { canonicalModelId } from "@houston/domain";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";
import type { ModelNotOfferedError } from "./provider-error";
import { safeGetModel, safeModelIds } from "./providers";

test("pi ships a real, non-empty catalog for both OpenCode gateways", () => {
  for (const id of ["opencode", "opencode-go"]) {
    expect(safeModelIds(id).length, id).toBeGreaterThan(0);
    expect(safeModelIds(id), id).toEqual(piModelIds(id));
  }
});

test("a stored OpenCode pin on a row pi dropped still resolves to a runnable model", () => {
  for (const [provider, stale, successor] of [
    ["opencode", "mimo-v2.5-free", "mimo-v2.6-flash-free"],
    ["opencode", "claude-sonnet-4", "claude-sonnet-4-6"],
    ["opencode", "nemotron-3-ultra-free", "nemotron-3.5-super-vl-free"],
    ["opencode", "glm-5.1", "glm-5.3"],
    ["opencode", "glm-5.2", "glm-5.3"],
    ["opencode-go", "glm-5.1", "glm-5.3"],
    ["opencode-go", "glm-5.2", "glm-5.3"],
    ["opencode-go", "kimi-k2.6", "kimi-k2.7-code"],
    ["opencode-go", "qwen3.7-max", "qwen3.8-max"],
    ["opencode-go", "space-bunny-free", "deepseek-v4.1-flash"],
    ["opencode-go", "space-bunny", "deepseek-v4.1-flash"],
    ["opencode-go", "deepseek-v4-flash", "deepseek-v4.1-flash"],
    ["opencode-go", "deepseek-v4-flash-vision-exp", "deepseek-v4.1-flash"],
    ["opencode-go", "minimax-m2.7", "minimax-m3"],
    ["opencode-go", "grok-4.6", "grok-4.7"],
    ["opencode-go", "minimax-m3.1-flash-free", "minimax-m3.1-flash"],
    ["opencode-go", "gemini-4-argon-contributor", "gemini-4-argon"],
  ] as const) {
    expect(piModelIds(provider), stale).not.toContain(stale);
    const pinned = canonicalModelId(provider, stale);
    expect(pinned, stale).toBe(successor);
    const model = safeGetModel(provider, pinned ?? "", true) as {
      id?: string;
      provider?: string;
    };
    expect(model.id, stale).toBe(successor);
    expect(model.provider, stale).toBe(provider);
  }
});

test("a pin on a dropped row with no successor gets a runnable switch target", () => {
  for (const [provider, stale] of [
    ["opencode", "cat-jam-free"],
    ["opencode", "deepseek-v4-flash-vision-exp"],
    ["opencode-go", "step-5-preview-free"],
    ["opencode", "deepseek-v4-flash"],
    ["opencode", "longcat-2.5-preview-free"],
    ["opencode-go", "longcat-2.5-preview-free"],
    ["opencode", "glm-5"],
    ["opencode", "glm-5.3-flash-free"],
    ["opencode", "inkling-2-small-free"],
    ["opencode", "minimax-m3.1-flash-free"],
    ["opencode", "gemini-3-flash"],
    ["opencode", "gemini-3.1-pro"],
  ] as const) {
    expect(canonicalModelId(provider, stale), stale).toBe(stale);
    let thrown: unknown;
    try {
      safeGetModel(provider, stale, true);
    } catch (err) {
      thrown = err;
    }
    const { providerError } = thrown as ModelNotOfferedError;
    expect(providerError.kind, stale).toBe("model_unavailable");
    const fallback =
      providerError.kind === "model_unavailable"
        ? providerError.suggested_fallback
        : null;
    expect(safeModelIds(provider), stale).toContain(fallback);
  }
});

test("an OpenCode id pi never listed is still pinnable — the gateway answers for it", () => {
  expect(canonicalModelId("opencode", "some-model-pi-has-not-baked")).toBe(
    "some-model-pi-has-not-baked",
  );
  expect(canonicalModelId("opencode-go", "another-unlisted-row")).toBe(
    "another-unlisted-row",
  );
});
