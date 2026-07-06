import { expect, test } from "vitest";
import { wireTurnPin } from "../src/engine-adapter/synthetic";

/**
 * The send-time app→engine pin mapping (HOU-695): every send forwards the
 * chat's OWN provider/model so the runtime runs the turn on exactly that
 * pick instead of the agent-wide settings. The mapping must be fail-soft —
 * a stale/unknown UI id must degrade the pin, never hard-fail the turn.
 */

test("maps the app dialect to engine ids (openai → openai-codex, legacy aliases)", () => {
  expect(
    wireTurnPin({ provider: "openai", model: "gpt-5.5", effort: "high" }),
  ).toEqual({ provider: "openai-codex", model: "gpt-5.5", effort: "high" });
  // CLI-era bare tier aliases map at the same tier.
  expect(wireTurnPin({ provider: "claude", model: "opus" })).toEqual({
    provider: "anthropic",
    model: "claude-opus-4-8",
  });
});

test("modern engine ids pass through verbatim", () => {
  expect(wireTurnPin({ provider: "openai-codex", model: "gpt-5.5" })).toEqual({
    provider: "openai-codex",
    model: "gpt-5.5",
  });
});

test("open-catalog gateways keep the stored model verbatim", () => {
  expect(
    wireTurnPin({ provider: "opencode", model: "some-gateway-model" }),
  ).toEqual({ provider: "opencode", model: "some-gateway-model" });
});

test("an unknown model pins the provider only — a strict-validated pin would fail the turn", () => {
  expect(wireTurnPin({ provider: "anthropic", model: "claude-99" })).toEqual({
    provider: "anthropic",
  });
});

test("a new pi-ai provider passes through — the open catalog means the adapter no longer gatekeeps provider ids", () => {
  // Validity is enforced upstream (the frontend's effective-provider resolution
  // against the live /v1/catalog) and by the runtime; the adapter can't know
  // every pi-ai id, so a genuinely new provider must pin, not be dropped.
  expect(wireTurnPin({ provider: "groq", model: "llama-3.3-70b" })).toEqual({
    provider: "groq",
    model: "llama-3.3-70b",
  });
  expect(wireTurnPin({ provider: "groq", effort: "low" })).toEqual({
    provider: "groq",
    effort: "low",
  });
});

test("a model without a provider cannot be ownership-checked and is dropped", () => {
  expect(wireTurnPin({ model: "gpt-5.5" })).toBeUndefined();
});

test("no overrides → no pin (the runtime's own resolution is untouched)", () => {
  expect(wireTurnPin({})).toBeUndefined();
});
