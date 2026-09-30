import { canonicalModelId } from "@houston/domain";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";
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
  for (const id of ["opencode", "opencode-go"]) {
    expect(safeModelIds(id).length, id).toBeGreaterThan(0);
    expect(safeModelIds(id), id).toEqual(piModelIds(id));
  }
});

test("a stored OpenCode pin on a row pi 0.99.1 dropped still resolves to a runnable model", () => {
  // Each stored id was curated (or the default) while pi 0.85.1 shipped it.
  for (const [provider, stale, successor] of [
    ["opencode", "mimo-v2.5-free", "mimo-v2.6-flash-free"],
    ["opencode-go", "glm-5.1", "glm-5.2"],
    ["opencode-go", "kimi-k2.6", "kimi-k2.7-code"],
    ["opencode-go", "qwen3.7-max", "qwen3.8-max"],
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
