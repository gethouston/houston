import {
  effectiveModelWindow,
  MODEL_WINDOW_OVERRIDES,
  resolveModelWindow,
} from "@houston/protocol/model-windows";
import { expect, test } from "vitest";

test("resolveModelWindow: an override wins over pi's raw window", () => {
  // pi reports 1,050,000 for gpt-6-astra; Codex's effective window is 95% of
  // the 272k standard tier, with the opt-in 1M variant (× 95%) as the ceiling.
  expect(resolveModelWindow("openai-codex", "gpt-6-astra", 1_050_000)).toEqual({
    default: 258_400,
    max: 950_000,
  });
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
    effectiveModelWindow("openai-codex", "gpt-6-astra", 1_050_000, 40_000),
  ).toBe(258_400);
});

test("effectiveModelWindow: snaps up to the ceiling once observed exceeds the default", () => {
  // 300k observed proves the opt-in 1M variant is active.
  expect(
    effectiveModelWindow("openai-codex", "gpt-6-astra", 1_050_000, 300_000),
  ).toBe(950_000);
});

test("effectiveModelWindow: never reads below the observed count (mis-catalogued ceiling)", () => {
  // Observed above even the max floors the window at observed, so % <= 100.
  expect(
    effectiveModelWindow("openai-codex", "gpt-6-astra", 1_050_000, 1_200_000),
  ).toBe(1_200_000);
});

test("effectiveModelWindow: no-override model divides by pi's raw window", () => {
  expect(
    effectiveModelWindow("google", "gemini-2.5-pro", 1_048_576, 50_000),
  ).toBe(1_048_576);
});

// Pins the Anthropic sizing so a pi-ai catalog drift (or an accidental edit)
// fails CI rather than silently changing the bar + autocompact denominator.
test("MODEL_WINDOW_OVERRIDES: the Claude lineup carries no row (native 1M)", () => {
  expect(MODEL_WINDOW_OVERRIDES.anthropic).toBeUndefined();
  for (const id of [
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-1",
    "claude-haiku-5-5",
  ]) {
    expect(resolveModelWindow("anthropic", id, 1_000_000)).toEqual({
      default: 1_000_000,
      max: 1_000_000,
    });
  }
});

test("MODEL_WINDOW_OVERRIDES: every served Codex row reads the 95%-effective window with the 1M ceiling", () => {
  // pi reports 272,000 and one price tier for every served 272k Codex row;
  // Codex's own `/status` sizes against 95% of it. Without the override the bar
  // divides by 272,000 and reads the chat as emptier than Codex does — on
  // gpt-6-luna, the model every unpinned Codex turn runs on. Without the
  // ceiling the bar pins at 100% at 258k and compacts a chat the provider
  // would carry on under the opt-in 1M variant.
  for (const id of [
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6-astra",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ]) {
    expect(MODEL_WINDOW_OVERRIDES["openai-codex"][id], id).toEqual({
      default: 258_400,
      max: 950_000,
    });
    expect(resolveModelWindow("openai-codex", id, 272_000), id).toEqual({
      default: 258_400,
      max: 950_000,
    });
  }
  // pi reports 500,000 for both GPT-6.1 rows, and no `/status` reading backs
  // another number, so pi's windows stand.
  for (const id of ["gpt-6.1-terra", "gpt-6.1-sol"])
    expect(MODEL_WINDOW_OVERRIDES["openai-codex"][id]).toBeUndefined();
});

test("effectiveModelWindow: the Codex default divides by its effective window", () => {
  expect(
    effectiveModelWindow("openai-codex", "gpt-6-luna", 272_000, 60_000),
  ).toBe(258_400);
});
