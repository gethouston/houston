import { expect, test } from "vitest";
import {
  humanizedModelName,
  MODEL_DISPLAY,
  modelDisplayName,
} from "./model-display-names";
import { resolveSpokenModel } from "./provider-model-display";

test("names a curated model from the shared table", () => {
  expect(modelDisplayName("anthropic", "claude-opus-5")).toBe("Opus 5");
  expect(modelDisplayName("openai-codex", "gpt-6-astra")).toBe("GPT-6 Astra");
  expect(modelDisplayName("anthropic", "claude-9-imaginary")).toBeUndefined();
});

test("humanizes an uncurated id instead of printing it raw", () => {
  const cases: Record<string, string> = {
    "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5 (2025-09-29)",
    "claude-opus-4-1-20250805": "Claude Opus 4.1 (2025-08-05)",
    "claude-3-5-haiku-20241022": "Claude 3.5 Haiku (2024-10-22)",
    "claude-3-opus-20240229": "Claude 3 Opus (2024-02-29)",
    "claude-opus-4-0": "Claude Opus 4.0",
    "claude-3-5-haiku-latest": "Claude 3.5 Haiku Latest",
    "openai/gpt-oss-20b": "GPT OSS 20B",
    "anthropic/claude-sonnet-4.6": "Claude Sonnet 4.6",
    "some-model-12345678": "Some Model 12345678",
    "gpt-5-mini": "GPT 5 Mini",
  };
  for (const [id, name] of Object.entries(cases)) {
    expect(humanizedModelName(id)).toBe(name);
  }
});

test("an empty id humanizes to nothing (the caller decides its own copy)", () => {
  expect(humanizedModelName("")).toBe("");
});

test("every family reads newest first, which is what a bare name resolves to", () => {
  const version = (name: string): number => {
    const match = /(\d+(?:\.\d+)?)/.exec(name);
    return match ? Number.parseFloat(match[1]) : 0;
  };
  const family = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[\d.()-]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .join(" ");
  for (const [provider, rows] of Object.entries(MODEL_DISPLAY)) {
    const families = new Map<string, number[]>();
    for (const name of Object.values(rows ?? {}))
      families.set(family(name), [
        ...(families.get(family(name)) ?? []),
        version(name),
      ]);
    for (const [name, versions] of families)
      expect(
        versions,
        `${provider}'s "${name}" rows must read newest first`,
      ).toEqual([...versions].sort((a, b) => b - a));
  }
});

test("saying a tier name lands on that tier's lineup model", () => {
  expect(resolveSpokenModel("anthropic", "opus")?.id).toBe("claude-opus-5-5");
  expect(resolveSpokenModel("anthropic", "sonnet")?.id).toBe(
    "claude-sonnet-5-5",
  );
  expect(resolveSpokenModel("anthropic", "fable")?.id).toBe("claude-fable-5-2");
  expect(resolveSpokenModel("anthropic", "haiku")?.id).toBe("claude-haiku-5-5");
});

test("the table is keyed by pi's canonical provider ids", () => {
  expect(Object.keys(MODEL_DISPLAY)).not.toContain("openai");
  expect(MODEL_DISPLAY["openai-codex"]).toBeDefined();
});
