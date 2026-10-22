import { canonicalModelId } from "@houston/domain";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";
import type { ModelNotOfferedError } from "./provider-error";
import { safeGetModel, safeModelIds } from "./providers";

/**
 * The OpenCode gateways are "open catalog" in the sense the app's
 * `OPEN_CATALOG_PROVIDERS` means: the gateway routes more models than pi
 * enumerates, so a live SELECTION is not validated against pi's list. pi's
 * baked catalog for them is nonetheless large and finite, and `getModel` is
 * what builds the `Model` a turn runs on — an id pi dropped has no `Model` to
 * build, so a stored pin on one can only survive by being mapped to the id
 * that replaced it.
 */

test("pi ships a real, non-empty catalog for both OpenCode gateways", () => {
  // The offered set is pi's catalog verbatim — no Houston filter narrows it,
  // and it is never empty, so the `offered.length > 0` guard in safeGetModel is
  // always live for these two.
  for (const id of ["opencode", "opencode-go"]) {
    expect(safeModelIds(id).length, id).toBeGreaterThan(0);
    expect(safeModelIds(id), id).toEqual(piModelIds(id));
  }
});

test("a stored OpenCode pin on a row pi dropped still resolves to a runnable model", () => {
  // Each row is a dropped id with a same-price successor: pi 0.87.1 dropped
  // opencode's `mimo-v2.5-free`, pi 0.99.1 the three OpenCode Go rows, pi
  // 1.1.0 OpenCode Go's `space-bunny-free` preview, pi 1.3.0 four more
  // OpenCode Go rows, pi 1.4.0 `space-bunny` and opencode's `claude-sonnet-4`.
  for (const [provider, stale, successor] of [
    ["opencode", "mimo-v2.5-free", "mimo-v2.6-flash-free"],
    ["opencode", "claude-sonnet-4", "claude-sonnet-4-6"],
    ["opencode-go", "glm-5.1", "glm-5.2"],
    ["opencode-go", "kimi-k2.6", "kimi-k2.7-code"],
    ["opencode-go", "qwen3.7-max", "qwen3.8-max"],
    ["opencode-go", "space-bunny-free", "deepseek-v4.1-flash"],
    ["opencode-go", "space-bunny", "deepseek-v4.1-flash"],
    ["opencode-go", "deepseek-v4-flash", "deepseek-v4.1-flash"],
    ["opencode-go", "deepseek-v4-flash-vision-exp", "deepseek-v4.1-flash"],
    ["opencode-go", "minimax-m2.7", "minimax-m3"],
    ["opencode-go", "grok-4.6", "grok-4.7"],
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
  // pi 1.4.0 dropped free previews with no same-price successor. A pinned turn
  // on one fails as model_unavailable, never a crash, and the card offers the
  // provider default.
  for (const [provider, stale] of [
    ["opencode", "cat-jam-free"],
    ["opencode", "deepseek-v4-flash-vision-exp"],
    ["opencode-go", "step-5-preview-free"],
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
  // Pass-through is the open-catalog contract: only a curated rename is
  // rewritten, so a model the gateway gained since this pi build keeps its id.
  expect(canonicalModelId("opencode", "some-model-pi-has-not-baked")).toBe(
    "some-model-pi-has-not-baked",
  );
  expect(canonicalModelId("opencode-go", "another-unlisted-row")).toBe(
    "another-unlisted-row",
  );
});
