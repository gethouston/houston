import {
  effectiveModelWindow,
  MODEL_WINDOW_OVERRIDES,
  resolveModelWindow,
} from "@houston/protocol/model-windows";
import { expect, test } from "vitest";

test("resolveModelWindow: an override wins over pi's raw window", () => {
  // pi reports 1,000,000 for the anthropic flagship, but the real default is 200k.
  expect(resolveModelWindow("anthropic", "claude-opus-4-8", 1_000_000)).toEqual(
    { default: 200_000, max: 1_000_000 },
  );
});

test("resolveModelWindow: no override falls back to pi's raw as both default + max", () => {
  // Gemini via the native `google` provider: pi's 1,048,576 is correct, so no
  // override — default and max are both the raw window (no snapping).
  expect(
    resolveModelWindow("google", "gemini-3-flash-preview", 1_048_576),
  ).toEqual({ default: 1_048_576, max: 1_048_576 });
  // An entirely unknown model likewise passes pi's raw window through.
  expect(resolveModelWindow("nope", "who", 12_345)).toEqual({
    default: 12_345,
    max: 12_345,
  });
});

test("effectiveModelWindow: starts at the default before observed usage proves more", () => {
  expect(
    effectiveModelWindow("anthropic", "claude-opus-4-8", 1_000_000, 40_000),
  ).toBe(200_000);
});

test("effectiveModelWindow: snaps up to the ceiling once observed exceeds the default", () => {
  // 250k observed proves the credit-gated 1M window is active.
  expect(
    effectiveModelWindow("anthropic", "claude-opus-4-8", 1_000_000, 250_000),
  ).toBe(1_000_000);
});

test("effectiveModelWindow: never reads below the observed count (mis-catalogued ceiling)", () => {
  // Observed above even the max floors the window at observed, so % <= 100.
  expect(
    effectiveModelWindow("anthropic", "claude-opus-4-8", 1_000_000, 1_200_000),
  ).toBe(1_200_000);
});

test("effectiveModelWindow: no-override model divides by pi's raw window", () => {
  expect(
    effectiveModelWindow("google", "gemini-2.5-pro", 1_048_576, 50_000),
  ).toBe(1_048_576);
});

// Pins the curated Anthropic windows so a pi-ai catalog drift (or an accidental
// edit) fails CI rather than silently changing the bar + autocompact denominator.
test("MODEL_WINDOW_OVERRIDES: Anthropic flagships are 200k default / 1M ceiling", () => {
  for (const id of [
    "claude-sonnet-4-6",
    "claude-opus-4-7",
    "claude-opus-4-8",
  ]) {
    expect(MODEL_WINDOW_OVERRIDES.anthropic[id]).toEqual({
      default: 200_000,
      max: 1_000_000,
    });
  }
  // fable-5 is intentionally NOT gated (pi's 1M stands).
  expect(MODEL_WINDOW_OVERRIDES.anthropic["claude-fable-5"]).toBeUndefined();
});
