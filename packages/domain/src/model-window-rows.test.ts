import { MODEL_WINDOW_OVERRIDES } from "@houston/protocol/model-windows";
import { expect, test } from "vitest";
import type { ProviderId } from "./provider-ids";
import { VALID_MODELS } from "./provider-valid-models";

/**
 * The window table's own rule (`@houston/protocol` model-windows.ts): every row
 * names a model this catalog still lists. A row for a model the catalog
 * dropped is a ceiling no turn can reach, and a stale ceiling is worse than
 * none.
 */
test("every context-window row names a model the domain catalog lists", () => {
  for (const [provider, rows] of Object.entries(MODEL_WINDOW_OVERRIDES)) {
    const valid = VALID_MODELS[provider as ProviderId];
    for (const id of Object.keys(rows))
      expect(valid?.has(id), `${provider} ${id}`).toBe(true);
  }
});
