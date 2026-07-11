import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import { resolvePlanReadyOverride } from "../src/lib/plan-ready.ts";

const planReady: InteractionStep = {
  kind: "plan_ready",
  id: "p1",
  summary: "Draft the email, build the guest list, schedule the send.",
};
const question: InteractionStep = {
  kind: "question",
  id: "q1",
  question: "Which account?",
};
const connect: InteractionStep = {
  kind: "connect",
  id: "c1",
  toolkit: "gmail",
};

describe("resolvePlanReadyOverride", () => {
  it("renders the card for a lone, undismissed plan_ready step", () => {
    deepStrictEqual(resolvePlanReadyOverride([planReady], null), {
      kind: "card",
      summary: planReady.summary,
    });
  });

  it("returns the composer once THIS plan is dismissed (Keep planning)", () => {
    deepStrictEqual(resolvePlanReadyOverride([planReady], planReady.summary), {
      kind: "none",
    });
  });

  it("re-shows the card for a later, different plan", () => {
    const next: InteractionStep = {
      kind: "plan_ready",
      id: "p2",
      summary: "A revised plan the agent drafted next.",
    };
    deepStrictEqual(resolvePlanReadyOverride([next], planReady.summary), {
      kind: "card",
      summary: next.summary,
    });
  });

  it("routes a question sequence to the stepper", () => {
    const result = resolvePlanReadyOverride([question, connect], null);
    strictEqual(result.kind, "stepper");
    if (result.kind === "stepper")
      deepStrictEqual(result.steps, [question, connect]);
  });

  it("defensively strips a plan_ready step from a mixed sequence", () => {
    const result = resolvePlanReadyOverride([question, planReady], null);
    strictEqual(result.kind, "stepper");
    if (result.kind === "stepper") deepStrictEqual(result.steps, [question]);
  });

  it("returns none when nothing renderable survives the filter", () => {
    deepStrictEqual(resolvePlanReadyOverride([], null), { kind: "none" });
  });
});
