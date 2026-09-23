import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import type { StepperState } from "@houston-ai/chat";
import { hydrateParkedState } from "../src/lib/interaction-draft-hydrate.ts";

const APPROVAL: InteractionStep = {
  kind: "question",
  id: "a1",
  question: "Run this?",
  detail: "rm -rf ~/photos",
  requestId: "r1",
  options: [
    { kind: "approval", id: "approve", label: "Yes" },
    { kind: "approval", id: "decline", label: "No" },
  ],
};
const QUESTION: InteractionStep = {
  kind: "question",
  id: "q2",
  question: "Which folder?",
};
const CONNECT: InteractionStep = {
  kind: "connect",
  id: "c1",
  toolkit: "gmail",
};

function state(partial: Partial<StepperState>): StepperState {
  return { current: 0, reached: 0, answers: {}, drafts: {}, ...partial };
}

describe("hydrateParkedState", () => {
  it("hands back the very state it was given when no step needs approval", () => {
    const parked = state({
      current: 1,
      reached: 1,
      answers: { q2: { answer: "Invoices", optionId: null } },
      drafts: { c1: "typed" },
    });

    strictEqual(hydrateParkedState(parked, [QUESTION, CONNECT]), parked);
  });

  it("makes the user click an approval again before what follows it", () => {
    const parked = state({
      current: 1,
      reached: 1,
      answers: {
        a1: { answer: "Yes", optionId: "approve" },
        q2: { answer: "Invoices", optionId: null },
      },
      drafts: { q2: "half typed" },
    });

    const hydrated = hydrateParkedState(parked, [APPROVAL, QUESTION]);

    deepStrictEqual(hydrated, {
      current: 0,
      reached: 0,
      answers: { q2: { answer: "Invoices", optionId: null } },
      drafts: { q2: "half typed" },
    });
  });

  it("rewinds to the FIRST unapproved step when two approvals were answered", () => {
    const second: InteractionStep = { ...APPROVAL, id: "a2", requestId: "r2" };
    const parked = state({
      current: 2,
      reached: 2,
      answers: {
        a1: { answer: "Yes", optionId: "approve" },
        a2: { answer: "Yes", optionId: "approve" },
      },
    });

    const hydrated = hydrateParkedState(parked, [APPROVAL, second, QUESTION]);

    strictEqual(hydrated.reached, 0);
    strictEqual(hydrated.current, 0);
    deepStrictEqual(hydrated.answers, {});
  });

  it("leaves an approval the user has not reached yet untouched", () => {
    const parked = state({
      current: 1,
      reached: 1,
      answers: { q2: { answer: "Invoices", optionId: null } },
    });

    strictEqual(hydrateParkedState(parked, [QUESTION, APPROVAL]), parked);
  });

  it("never rewinds a user who had already walked back past the approval", () => {
    const parked = state({
      current: 0,
      reached: 2,
      answers: { a1: { answer: "Yes", optionId: "approve" } },
      drafts: { q2: "half typed" },
    });

    const hydrated = hydrateParkedState(parked, [
      QUESTION,
      APPROVAL,
      { kind: "question", id: "q3", question: "Anything else?" },
    ]);

    strictEqual(hydrated.current, 0);
    strictEqual(hydrated.reached, 1);
    deepStrictEqual(hydrated.drafts, { q2: "half typed" });
  });
});
