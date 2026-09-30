import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { resolveTurnModel } from "../turn/turn-model";
import {
  ANTHROPIC_PROVIDER_ID,
  anthropicOfferedModelIds,
  lineupModelId,
} from "./anthropic-lineup";
import { piModelIds } from "./pi-catalog";
import { ModelNotOfferedError } from "./provider-error";
import { providerDefaultModel, safeGetModel, safeModelIds } from "./providers";

/**
 * The `anthropic` provider runs exactly the Claude lineup, and every Claude id
 * stored before the lineup moved (agent configs, missions, routines, turn
 * bodies) runs on its own family's lineup model: an Opus agent never lands on
 * Sonnet.
 */

const LINEUP = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"];

const RETIRED: Record<string, string> = {
  "claude-opus-5": "claude-opus-5-5",
  "claude-opus-4-8": "claude-opus-5-5",
  "claude-opus-4-7": "claude-opus-5-5",
  opus: "claude-opus-5-5",
  "claude-sonnet-5": "claude-sonnet-5-5",
  "claude-sonnet-4-6": "claude-sonnet-5-5",
  sonnet: "claude-sonnet-5-5",
  "claude-fable-5": "claude-fable-5-1",
};

const idOf = (m: unknown) => (m as { id?: string }).id;

test("the anthropic provider offers exactly the lineup, in picker order", () => {
  expect(safeModelIds(ANTHROPIC_PROVIDER_ID)).toEqual(LINEUP);
  // pi really ships every lineup model, so the offer is not a promise pi
  // cannot keep; and pi still ships the older rows the lineup leaves out.
  const pi = piModelIds(ANTHROPIC_PROVIDER_ID);
  for (const id of LINEUP) expect(pi).toContain(id);
  expect(pi).toContain("claude-opus-4-8");
  expect(anthropicOfferedModelIds(pi)).toEqual(LINEUP);
});

test("a fresh anthropic turn with no model runs Sonnet 5.5", () => {
  expect(providerDefaultModel(ANTHROPIC_PROVIDER_ID)).toBe("claude-sonnet-5-5");
});

test("a pinned retired Claude id runs on its own family's lineup model", () => {
  for (const [stored, lineup] of Object.entries(RETIRED))
    expect(
      idOf(safeGetModel(ANTHROPIC_PROVIDER_ID, stored, true)),
      stored,
    ).toBe(lineup);
});

test("a saved retired Claude id runs on its own family's lineup model", () => {
  for (const [stored, lineup] of Object.entries(RETIRED))
    expect(
      idOf(safeGetModel(ANTHROPIC_PROVIDER_ID, stored, false)),
      stored,
    ).toBe(lineup);
});

test("a cloud turn resolves a retired pin and a retired saved model alike", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "houston-anthropic-lineup-"));
  writeFileSync(
    join(dataDir, "settings.json"),
    JSON.stringify({ models: { anthropic: "claude-opus-4-8" } }),
  );
  expect(idOf(resolveTurnModel(dataDir, ANTHROPIC_PROVIDER_ID))).toBe(
    "claude-opus-5-5",
  );
  expect(
    idOf(resolveTurnModel(dataDir, ANTHROPIC_PROVIDER_ID, "claude-sonnet-5")),
  ).toBe("claude-sonnet-5-5");
});

test("a Haiku pin has no lineup model: it fails naming Sonnet 5.5 as the switch", () => {
  let thrown: unknown;
  try {
    safeGetModel(ANTHROPIC_PROVIDER_ID, "claude-haiku-4-5", true);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(ModelNotOfferedError);
  const { providerError } = thrown as ModelNotOfferedError;
  expect(
    providerError.kind === "model_unavailable"
      ? providerError.suggested_fallback
      : null,
  ).toBe("claude-sonnet-5-5");
  // A SAVED Haiku id falls back to the default instead of failing the turn.
  expect(
    idOf(safeGetModel(ANTHROPIC_PROVIDER_ID, "claude-haiku-4-5", false)),
  ).toBe("claude-sonnet-5-5");
});

test("the lineup rule never touches another provider's Claude rows", () => {
  expect(lineupModelId("opencode", "claude-opus-4-8")).toBe("claude-opus-4-8");
  expect(lineupModelId("github-copilot", "claude-sonnet-5")).toBe(
    "claude-sonnet-5",
  );
  expect(
    lineupModelId("amazon-bedrock", "global.anthropic.claude-opus-4-8"),
  ).toBe("global.anthropic.claude-opus-4-8");
});
