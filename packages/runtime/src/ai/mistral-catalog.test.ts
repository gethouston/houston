import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];

test("Mistral Large 4 is in pi's mistral catalog", () => {
  const m = getModel("mistral", "mistral-large-4" as ModelId);
  expect(m?.name).toBe("Mistral Large 4");
  expect(m?.reasoning).toBe(true);
  expect(m?.contextWindow).toBeGreaterThanOrEqual(262_144);
  expect(m?.maxTokens).toBeGreaterThan(8_192);
  expect(piModelIds("mistral")).toContain("mistral-large-4");
});
