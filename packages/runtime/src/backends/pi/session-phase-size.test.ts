import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { unansweredWindowMs } from "../../ai/first-byte";
import { hedgedSession } from "../../ai/hedged-session.test-support";
import type { ModelPhase } from "../model-phase";

/**
 * The stall watchdog's `unanswered` window must cover every hedged attempt of
 * the request pi actually sends. pi emits `turn_start` before it appends the
 * turn's prompt, so a size read there misses the prompt: a long first prompt
 * would get the small-prompt window and be cut before its first resend.
 */

const requesting = (phases: ModelPhase[]) =>
  phases.filter(
    (p): p is Extract<ModelPhase, { phase: "requesting" }> =>
      p.phase === "requesting",
  );

test("the phase of a long first prompt carries that prompt's size", async () => {
  const { session } = await hedgedSession([fauxAssistantMessage("Read it.")]);
  const phases: ModelPhase[] = [];
  session.subscribeModelPhase((p) => phases.push(p));

  await session.prompt("x".repeat(600_000));

  const sent = requesting(phases).at(-1);
  expect(sent?.provider).toBe("faux");
  // 150k tokens of prompt, and the system prompt pi adds to it.
  expect(sent?.promptTokens).toBeGreaterThanOrEqual(150_000);
  expect(sent?.promptTokens).toBeLessThan(160_000);
  expect(phases.at(-2)).toEqual({ phase: "responding" });
  // Each of the three attempts gets 15 s plus 50 ms per thousand tokens; the
  // small-prompt window would have been 50 s.
  expect(
    unansweredWindowMs("faux", 15_000, sent?.promptTokens),
  ).toBeGreaterThanOrEqual(75_000);
});
