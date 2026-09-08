import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import { expect, test } from "vitest";
import { PROVIDERS } from "./catalog";

/**
 * The host catalog is read LIVE on the cloud per-turn path
 * (`turn/dispatch-providers.ts` → the `activeModel` a hosted agent starts on),
 * so a default restated here and changed in `@houston/domain` sends a hosted
 * turn to a model the picker never offered. The domain table owns the value;
 * this file may only point at it.
 */

test("no catalog entry restates a default the domain owns", () => {
  for (const p of PROVIDERS) {
    if (p.defaultModel === undefined) continue;
    expect(p.defaultModel, p.id).toBe(DEFAULT_MODEL[p.id]);
  }
});

test("every curated model list starts on the domain default, and offers it", () => {
  for (const p of PROVIDERS) {
    if (!p.models?.length) continue;
    expect(p.defaultModel, p.id).toBe(DEFAULT_MODEL[p.id]);
    expect(p.models, p.id).toContain(p.defaultModel);
  }
});
