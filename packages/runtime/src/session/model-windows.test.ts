import {
  effectiveModelWindow,
  MODEL_WINDOW_OVERRIDES,
  resolveModelWindow,
} from "@houston/protocol/model-windows";
import { expect, test } from "vitest";

test("resolveModelWindow: an override wins over pi's raw window", () => {
  expect(resolveModelWindow("openai-codex", "gpt-6-astra", 1_050_000)).toEqual({
    default: 258_400,
    max: 828_400,
  });
});

test("resolveModelWindow: no override falls back to pi's raw as both default + max", () => {
  expect(
    resolveModelWindow("google", "gemini-3-flash-preview", 1_048_576),
  ).toEqual({ default: 1_048_576, max: 1_048_576 });
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
  expect(
    effectiveModelWindow("openai-codex", "gpt-6-astra", 1_050_000, 300_000),
  ).toBe(828_400);
});

test("effectiveModelWindow: never reads below the observed count (mis-catalogued ceiling)", () => {
  expect(
    effectiveModelWindow("openai-codex", "gpt-6-astra", 1_050_000, 1_200_000),
  ).toBe(1_200_000);
});

test("effectiveModelWindow: no-override model divides by pi's raw window", () => {
  expect(
    effectiveModelWindow("google", "gemini-2.5-pro", 1_048_576, 50_000),
  ).toBe(1_048_576);
});

test("MODEL_WINDOW_OVERRIDES: the Claude lineup carries no row (native 1M)", () => {
  expect(MODEL_WINDOW_OVERRIDES.anthropic).toBeUndefined();
  for (const id of [
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-fable-5-2",
    "claude-haiku-5-5",
  ]) {
    expect(resolveModelWindow("anthropic", id, 1_000_000)).toEqual({
      default: 1_000_000,
      max: 1_000_000,
    });
  }
});

test("MODEL_WINDOW_OVERRIDES: every served Codex row reads the 95%-effective window with the 872k ceiling", () => {
  for (const id of [
    "gpt-6-luna",
    "gpt-6-sol",
    "gpt-6-astra",
    "gpt-6.2-astra",
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ]) {
    expect(MODEL_WINDOW_OVERRIDES["openai-codex"][id], id).toEqual({
      default: 258_400,
      max: 828_400,
    });
    expect(resolveModelWindow("openai-codex", id, 272_000), id).toEqual({
      default: 258_400,
      max: 828_400,
    });
  }
  for (const id of ["gpt-6.1-terra", "gpt-6.1-sol", "gpt-6.2-sol"])
    expect(MODEL_WINDOW_OVERRIDES["openai-codex"][id]).toBeUndefined();
});

test("effectiveModelWindow: the Codex default divides by its effective window", () => {
  expect(
    effectiveModelWindow("openai-codex", "gpt-6-luna", 272_000, 60_000),
  ).toBe(258_400);
});
