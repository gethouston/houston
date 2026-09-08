import { expect, test } from "vitest";
import {
  humanizedModelName,
  MODEL_DISPLAY,
  modelDisplayName,
} from "./model-display-names";
import { resolveSpokenModel } from "./provider-model-display";

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

/**
 * Table ORDER is behavior, not formatting: `resolveSpokenModel` answers a
 * family name ("opus", "sonnet") with the FIRST row that carries it, so the
 * order IS the "newest of that family" rule. A row inserted above a newer
 * sibling silently re-points every spoken name in its family at an older model,
 * and nothing else in the codebase would notice.
 *
 * A family is one tier of one lab — the display name with its version stripped
 * ("Claude Opus 4.8" -> "claude opus"). Across tiers there is no newest: saying
 * "claude" to a gateway that serves Sonnet and Opus is ambiguous by nature, and
 * `resolveSpokenModel` flags it rather than ranking them.
 */
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

test("saying a tier name lands on the newest model of that tier", () => {
  expect(resolveSpokenModel("anthropic", "opus")?.id).toBe("claude-opus-5");
  expect(resolveSpokenModel("anthropic", "sonnet")?.id).toBe("claude-sonnet-5");
  expect(resolveSpokenModel("anthropic", "haiku")?.id).toBe("claude-haiku-4-5");
});

test("the table is keyed by pi's canonical provider ids", () => {
  // `openai` is Houston's DISPLAY spelling of `openai-codex`. A row filed under
  // it would be unreachable: every lookup canonicalizes first.
  expect(Object.keys(MODEL_DISPLAY)).not.toContain("openai");
  expect(MODEL_DISPLAY["openai-codex"]).toBeDefined();
});
