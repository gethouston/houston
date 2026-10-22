import { expect, test } from "vitest";
import { firstByteDeadlineMs, unansweredWindowMs } from "./first-byte";

/**
 * Anthropic sends its first byte only after reading the prompt. On one
 * production Claude session, prompts past 600k tokens took up to 26.6 s to
 * answer; a fixed 15 s deadline cut every one of them.
 */

test("a small or unsized prompt keeps the configured deadline", () => {
  expect(firstByteDeadlineMs("anthropic", 15_000)).toBe(15_000);
  expect(firstByteDeadlineMs("anthropic", 15_000, undefined)).toBe(15_000);
  expect(firstByteDeadlineMs("anthropic", 15_000, 0)).toBe(15_000);
  expect(firstByteDeadlineMs("anthropic", 15_000, Number.NaN)).toBe(15_000);
});

test("the deadline grows with the prompt the provider must read first", () => {
  expect(firstByteDeadlineMs("anthropic", 15_000, 200_000)).toBe(25_000);
  expect(firstByteDeadlineMs("anthropic", 15_000, 400_000)).toBe(35_000);
  expect(firstByteDeadlineMs("anthropic", 15_000, 800_000)).toBe(55_000);
  expect(firstByteDeadlineMs("openai-codex", 15_000, 1_000_000)).toBe(65_000);
});

test("an 800k-token prompt gets about twice the slowest first byte measured there", () => {
  const deadline = firstByteDeadlineMs("anthropic", 15_000, 800_000);
  expect(deadline).toBeGreaterThan(2 * 26_600);
  // Still far inside the 300 s a stalled provider sat silent for.
  expect(unansweredWindowMs("anthropic", 15_000, 800_000)).toBe(183_333);
});

test("a custom endpoint and a disabled deadline stay off at any size", () => {
  expect(firstByteDeadlineMs("openai-compatible", 15_000, 800_000)).toBe(0);
  expect(firstByteDeadlineMs("anthropic", 0, 800_000)).toBe(0);
  expect(unansweredWindowMs("openai-compatible", 15_000, 800_000)).toBe(0);
  expect(unansweredWindowMs("anthropic", 0, 800_000)).toBe(0);
});

test("the unanswered window follows the sized deadline", () => {
  expect(unansweredWindowMs("anthropic", 15_000)).toBe(50_000);
  expect(unansweredWindowMs("anthropic", 15_000, 200_000)).toBe(83_333);
});
