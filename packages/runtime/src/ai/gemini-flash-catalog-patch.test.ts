import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import "./gemini-flash-catalog-patch";
import { piModelIds } from "./pi-catalog";

type ModelId = Parameters<typeof getModel>[1];

test("Gemini 3.6 Flash is injected into the google catalog", () => {
  const m = getModel("google", "gemini-3.6-flash" as ModelId);
  expect(m).toBeDefined();
  expect(m?.name).toBe("Gemini 3.6 Flash");
  expect(m?.contextWindow).toBe(1048576);
  expect(m?.reasoning).toBe(true);
  expect(piModelIds("google")).toContain("gemini-3.6-flash");
});

test("Gemini 3.5 Flash Lite is injected into the google catalog", () => {
  const m = getModel("google", "gemini-3.5-flash-lite" as ModelId);
  expect(m).toBeDefined();
  expect(m?.name).toBe("Gemini 3.5 Flash Lite");
  expect(m?.cost.input).toBe(0.3);
  expect(piModelIds("google")).toContain("gemini-3.5-flash-lite");
});

test("the patch is idempotent (re-import cannot duplicate entries)", async () => {
  const { ensureGeminiFlashBackports } = await import(
    "./gemini-flash-catalog-patch"
  );
  ensureGeminiFlashBackports();
  ensureGeminiFlashBackports();
  const ids = piModelIds("google").filter((id) => id === "gemini-3.6-flash");
  expect(ids).toHaveLength(1);
});
