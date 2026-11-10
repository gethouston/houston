import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { getModel, getModels } from "@earendil-works/pi-ai/compat";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

test("Fable 5.2 is identical across every pi catalog read path", () => {
  const id = "claude-fable-5-2";
  const model = getModel("anthropic", id);
  expect(model).toBeDefined();
  expect(model).toMatchObject({
    id,
    name: "Claude Fable 5.2",
    api: "anthropic-messages",
    provider: "anthropic",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    reasoning: true,
    input: ["text", "image"],
    cost: { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
    thinkingLevelMap: { off: null, xhigh: "xhigh", max: "max" },
    compat: {
      forceAdaptiveThinking: true,
      supportsMidConvoEffort: true,
      supportsMidConvoSystemMessages: true,
      supportsMidConvoToolChanges: true,
      supportsStrictTools: true,
    },
  });
  if (!model) throw new Error("Fable 5.2 missing");
  const previous = getModel("anthropic", "claude-fable-5-1");
  expect(model.promptCache).toEqual(previous.promptCache);
  expect(model.inputLimits).toEqual(previous.inputLimits);
  expect(getSupportedThinkingLevels(model)).toEqual([
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  expect(getModels("anthropic").find((row) => row.id === id)).toEqual(model);
  expect(
    builtinProviders()
      .find((provider) => provider.id === "anthropic")
      ?.getModels()
      .find((row) => row.id === id),
  ).toEqual(model);
  expect(piModelIds("anthropic")).toContain(id);
});
