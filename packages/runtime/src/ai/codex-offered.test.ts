import { config as hostConfig } from "@houston/host/src/config";
import { expect, test } from "vitest";
import {
  CODEX_DEFAULT_MODEL,
  CODEX_PICKER_HIDDEN_MODEL_IDS,
  CODEX_PROVIDER_ID,
  codexOfferedModelIds,
} from "./codex-offered";
import { piModelIds } from "./pi-catalog";
import { ModelNotOfferedError } from "./provider-error";
import { providerDefaultModel, safeGetModel, safeModelIds } from "./providers";

const SERVED = [
  "gpt-6-luna",
  "gpt-6.1-terra",
  "gpt-6-sol",
  "gpt-6.1-sol",
  "gpt-6.2-sol",
  "gpt-6-astra",
  "gpt-6.2-astra",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
];
const REFUSED = ["gpt-5.3-codex-spark", "gpt-5.5"];

test("the Codex offer is pi's catalog minus the rows the subscription refuses", () => {
  const offered = safeModelIds(CODEX_PROVIDER_ID);
  for (const id of SERVED) expect(offered).toContain(id);
  for (const id of REFUSED) expect(offered).not.toContain(id);
  expect(codexOfferedModelIds([...SERVED, ...REFUSED])).toEqual(SERVED);
  expect(offered).toEqual(codexOfferedModelIds(piModelIds(CODEX_PROVIDER_ID)));
});

test("a turn pinned to openai-codex with NO model lands on a model Codex accepts", () => {
  const fallback = providerDefaultModel(CODEX_PROVIDER_ID);
  expect(fallback).toBe(CODEX_DEFAULT_MODEL);
  expect(safeModelIds(CODEX_PROVIDER_ID)).toContain(fallback);
  expect(
    (safeGetModel(CODEX_PROVIDER_ID, fallback, false) as { id?: string }).id,
  ).toBe(CODEX_DEFAULT_MODEL);
});

test("a pin naming a refused id fails with a served model as the switch target", () => {
  let thrown: unknown;
  try {
    safeGetModel(CODEX_PROVIDER_ID, "gpt-5.3-codex-spark", true);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(ModelNotOfferedError);
  const { providerError } = thrown as ModelNotOfferedError;
  expect(providerError.kind).toBe("model_unavailable");
  const suggested =
    providerError.kind === "model_unavailable"
      ? providerError.suggested_fallback
      : null;
  expect(suggested).toBe(CODEX_DEFAULT_MODEL);
});

test("the cloud picker's Codex list is the served set minus the hidden rows, default first", () => {
  const served = codexOfferedModelIds(piModelIds(CODEX_PROVIDER_ID));
  for (const id of CODEX_PICKER_HIDDEN_MODEL_IDS) expect(served).toContain(id);
  expect(hostConfig.codexModels[0]).toBe(CODEX_DEFAULT_MODEL);
  expect([...hostConfig.codexModels].sort()).toEqual(
    served.filter((id) => !CODEX_PICKER_HIDDEN_MODEL_IDS.includes(id)).sort(),
  );
});

test("a saved refused id falls back to a served model instead of a dead turn", () => {
  expect(
    (
      safeGetModel(CODEX_PROVIDER_ID, "gpt-5.3-codex-spark", false) as {
        id?: string;
      }
    ).id,
  ).toBe(CODEX_DEFAULT_MODEL);
});
