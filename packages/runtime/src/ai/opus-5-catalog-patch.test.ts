import { getModel } from "@earendil-works/pi-ai/compat";
import { expect, test } from "vitest";
import "./opus-5-catalog-patch";
import { piModelIds } from "./pi-catalog";

test("Claude Opus 5 is injected into the anthropic catalog", () => {
  const m = getModel(
    "anthropic",
    "claude-opus-5" as Parameters<typeof getModel>[1],
  );
  expect(m).toBeDefined();
  expect(m?.name).toBe("Claude Opus 5");
  expect(m?.contextWindow).toBe(1_000_000);
  expect(m?.maxTokens).toBe(128_000);
  expect(m?.reasoning).toBe(true);
  expect(piModelIds("anthropic")).toContain("claude-opus-5");
});

test("the patch is idempotent (re-import cannot duplicate the entry)", async () => {
  const { ensureAnthropicOpus5 } = await import("./opus-5-catalog-patch");
  ensureAnthropicOpus5();
  ensureAnthropicOpus5();
  const ids = piModelIds("anthropic").filter((id) => id === "claude-opus-5");
  expect(ids).toHaveLength(1);
});
