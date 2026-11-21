import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { expect, test } from "vitest";
import { unansweredWindowMs } from "../../ai/first-byte";
import { hedgedSession } from "../../ai/hedged-session.test-support";
import type { ModelPhase } from "../model-phase";

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
  expect(sent?.promptTokens).toBeGreaterThanOrEqual(150_000);
  expect(sent?.promptTokens).toBeLessThan(160_000);
  expect(phases.at(-2)).toEqual({ phase: "responding" });
  expect(
    unansweredWindowMs("faux", 15_000, sent?.promptTokens),
  ).toBeGreaterThanOrEqual(75_000);
});
