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
  // The offered set is pi's catalog verbatim — no Houston filter narrows it,
  // and it is never empty, so the `offered.length > 0` guard in safeGetModel is
  // always live for these two.
  for (const id of ["opencode", "opencode-go"]) {
    expect(safeModelIds(id).length, id).toBeGreaterThan(0);
    expect(safeModelIds(id), id).toEqual(piModelIds(id));
  }
});

test("a stored OpenCode pin on a dropped free-tier id still resolves to a runnable model", () => {
  // pi 0.85.1 shipped opencode's `mimo-v2.5-free`; 0.87.1 replaced it with
  // `mimo-v2.6-flash-free` (same free tier: zero cost, text+image, 200k
  // window). A pin stored while the old id was curated reaches the fire path
  // as-is, so the read-time map is what keeps it running.
  const pinned = canonicalModelId("opencode", "mimo-v2.5-free");
  expect(pinned).toBe("mimo-v2.6-flash-free");
  const model = safeGetModel("opencode", pinned ?? "", true) as {
    id?: string;
    provider?: string;
  };
  expect(model.id).toBe("mimo-v2.6-flash-free");
  expect(model.provider).toBe("opencode");
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
