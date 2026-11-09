import { expect, test } from "vitest";
import { buildProviderCatalog } from "./pi-catalog";

test("GET /v1/catalog offers Fable 5.2 and maps older Fable rows to it", () => {
  const anthropic = buildProviderCatalog().find(
    (row) => row.id === "anthropic",
  );
  const model = anthropic?.models.find((row) => row.id === "claude-fable-5-2");
  expect(model).toMatchObject({
    name: "Claude Fable 5.2",
    contextWindow: 1_000_000,
    maxTokens: 128_000,
    reasoning: true,
    vision: true,
    pricing: { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 10 },
    thinkingLevels: ["low", "medium", "high", "xhigh", "max"],
  });
  expect(model?.runsAs).toBeUndefined();
  for (const id of ["claude-fable-5", "claude-fable-5-1"])
    expect(anthropic?.models.find((row) => row.id === id)?.runsAs).toBe(
      "claude-fable-5-2",
    );
});
