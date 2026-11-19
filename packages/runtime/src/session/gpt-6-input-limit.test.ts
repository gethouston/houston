import { getModels, getProviders } from "@earendil-works/pi-ai/compat";
import {
  autocompactPoint,
  compactionWindow,
  GPT_6_MAX_INPUT_TOKENS,
  modelInputLimit,
  resolveModelWindow,
} from "@houston/protocol/model-windows";
import { expect, test } from "vitest";
import { needsAutocompact } from "./autocompact";

type Provider = Parameters<typeof getModels>[0];

// Every GPT-6 and GPT-5.6 chat row pi ships, on every provider path.
const ROWS = getProviders().flatMap((provider) =>
  getModels(provider as Provider)
    .filter((m) => modelInputLimit(m.id) !== undefined)
    .map((m) => ({ provider, id: m.id, window: m.contextWindow })),
);
const CAP_POINT = (GPT_6_MAX_INPUT_TOKENS * 93) / 100;

test("the input cap matches the GPT-6 line under every gateway spelling", () => {
  for (const id of [
    "gpt-6-luna",
    "gpt-6.1-terra",
    "gpt-6.1-sol",
    "gpt-6-astra",
    "gpt-5.6-sol",
    "openai/gpt-6.1-sol",
    "openai/gpt-6-sol:batch",
    "openai/gpt-6.1-terra-pro",
    "openai/gpt-6-astra-fast",
    "global.openai.gpt-6-astra",
    "us.openai.gpt-6.1-sol",
  ])
    expect(modelInputLimit(id), id).toBe(922_000);
  for (const id of [
    "gpt-5.5",
    "gpt-5.4-mini",
    "claude-opus-5-5",
    "alibaba/qwen3.8-max-0902",
    "gpt-6x-sol",
  ])
    expect(modelInputLimit(id), id).toBeUndefined();
});

test("pi ships GPT-6 rows on the 1.05M paths this cap exists for", () => {
  const providers = new Set(
    ROWS.filter((r) => r.window > GPT_6_MAX_INPUT_TOKENS).map(
      (r) => r.provider,
    ),
  );
  for (const p of ["azure-openai-responses", "openrouter", "amazon-bedrock"])
    expect(providers, p).toContain(p);
});

test.each(ROWS)("$provider $id compacts before its input cap", (row) => {
  // The largest window the row resolves to: its snap-up ceiling.
  const { max } = resolveModelWindow(row.provider, row.id, row.window);
  const limit = modelInputLimit(row.id);
  const point = autocompactPoint(max, limit);
  expect(point).toBeLessThanOrEqual(CAP_POINT);
  expect(compactionWindow(max, limit)).toBeLessThanOrEqual(
    GPT_6_MAX_INPUT_TOKENS,
  );
  if (max >= 1_000_000) {
    // A long window keeps its long-context behavior, just inside the cap.
    expect(point).toBe(CAP_POINT);
    expect(needsAutocompact(point - 1, max, undefined, limit)).toBe(false);
    expect(needsAutocompact(point, max, undefined, limit)).toBe(true);
  }
});
