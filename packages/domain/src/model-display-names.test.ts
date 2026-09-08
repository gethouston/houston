import { expect, test } from "vitest";
import {
  humanizedModelName,
  MODEL_DISPLAY,
  modelDisplayName,
  modelLabel,
} from "./model-display-names";

/**
 * B6 — a raw model id must never reach the user. Every provider keeps far more
 * runnable ids than the picker shows (28 Anthropic ids, 7 visible), so a user
 * pinned to a preserved-but-invisible one read the raw string in the quota
 * cards, the picker trigger and the routine screen.
 */

test("names a curated model from the shared table", () => {
  expect(modelDisplayName("anthropic", "claude-opus-5")).toBe("Opus 5");
  // Keyed by pi's CANONICAL id: Houston shows Codex as `openai`, pi calls it
  // `openai-codex`, and this table speaks pi's dialect.
  expect(modelDisplayName("openai-codex", "gpt-6-astra")).toBe("GPT-6 Astra");
  expect(modelDisplayName("anthropic", "claude-9-imaginary")).toBeUndefined();
});

test("humanizes an uncurated id instead of printing it raw", () => {
  const cases: Record<string, string> = {
    // A dated Anthropic snapshot: still runnable, never in the picker.
    "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5 (2025-09-29)",
    "claude-opus-4-1-20250805": "Claude Opus 4.1 (2025-08-05)",
    "claude-3-5-haiku-20241022": "Claude 3.5 Haiku (2024-10-22)",
    "claude-3-opus-20240229": "Claude 3 Opus (2024-02-29)",
    // No date: the dashes are still a version number, not word breaks.
    "claude-opus-4-0": "Claude Opus 4.0",
    "claude-3-5-haiku-latest": "Claude 3.5 Haiku Latest",
    // Acronyms read as shouted words, and a size suffix keeps its unit.
    "openai/gpt-oss-20b": "GPT OSS 20B",
    // A gateway's vendor prefix restates the family the name already carries.
    "anthropic/claude-sonnet-4.6": "Claude Sonnet 4.6",
    // An 8-digit run that is not a date stays a plain number.
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

test("modelLabel always answers with a name, curated or generated", () => {
  expect(modelLabel("anthropic", "claude-opus-5")).toBe("Opus 5");
  expect(modelLabel("anthropic", "claude-sonnet-4-5-20250929")).toBe(
    "Claude Sonnet 4.5 (2025-09-29)",
  );
});

test("the table is keyed by pi's canonical provider ids", () => {
  // `openai` is Houston's DISPLAY spelling of `openai-codex`. A row filed under
  // it would be unreachable: every lookup canonicalizes first.
  expect(Object.keys(MODEL_DISPLAY)).not.toContain("openai");
  expect(MODEL_DISPLAY["openai-codex"]).toBeDefined();
});
