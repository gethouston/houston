import { expect, test } from "vitest";
import {
  CODEX_DEFAULT_MODEL,
  CODEX_PROVIDER_ID,
  codexOfferedModelIds,
} from "./codex-offered";
import { piModelIds } from "./pi-catalog";
import { ModelNotOfferedError } from "./provider-error";
import { providerDefaultModel, safeGetModel, safeModelIds } from "./providers";

/**
 * The rows OpenAI's Codex backend answered 200 for on 2026-09-07, probed with
 * Houston's own credential (see codex-offered.ts for the full method). pi's
 * catalog also carries gpt-5.4 and gpt-5.5, which that same probe refused.
 */
const SERVED = [
  "gpt-6-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
];
const REFUSED = ["gpt-5.4", "gpt-5.5"];

test("the Codex offer is pi's catalog minus the rows the subscription refuses", () => {
  const offered = safeModelIds(CODEX_PROVIDER_ID);
  for (const id of SERVED) expect(offered).toContain(id);
  for (const id of REFUSED) expect(offered).not.toContain(id);
  // Derived from pi, never hand-listed: a pi bump that adds a row surfaces it.
  expect(offered).toEqual(codexOfferedModelIds(piModelIds(CODEX_PROVIDER_ID)));
});

test("a turn pinned to openai-codex with NO model lands on a model Codex accepts", () => {
  // The Dobby defect: the pin resolved to the catalog default, and the default
  // was an id Codex answers `model_not_found` for — the mission died on arrival.
  const fallback = providerDefaultModel(CODEX_PROVIDER_ID);
  expect(fallback).toBe(CODEX_DEFAULT_MODEL);
  expect(safeModelIds(CODEX_PROVIDER_ID)).toContain(fallback);
  expect(
    (safeGetModel(CODEX_PROVIDER_ID, fallback, false) as { id?: string }).id,
  ).toBe(CODEX_DEFAULT_MODEL);
});

test("a pin naming a refused id fails with a served model as the switch target", () => {
  // pi's getModel still resolves gpt-5.5, so without the offered-set check the
  // pin sails through and the failure only appears as the provider's own 404.
  let thrown: unknown;
  try {
    safeGetModel(CODEX_PROVIDER_ID, "gpt-5.5", true);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(ModelNotOfferedError);
  const { providerError } = thrown as ModelNotOfferedError;
  expect(providerError.kind).toBe("model_unavailable");
  // The card names a model that actually runs, not another dead id.
  const suggested =
    providerError.kind === "model_unavailable"
      ? providerError.suggested_fallback
      : null;
  expect(suggested).toBe(CODEX_DEFAULT_MODEL);
});

test("a saved refused id falls back to a served model instead of a dead turn", () => {
  expect(
    (safeGetModel(CODEX_PROVIDER_ID, "gpt-5.5", false) as { id?: string }).id,
  ).toBe(CODEX_DEFAULT_MODEL);
});
