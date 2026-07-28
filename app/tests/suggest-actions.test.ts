import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import { resolveSuggestActionsOverride } from "../src/lib/suggest-actions.ts";

const actions: InteractionStep = {
  kind: "suggest_actions",
  id: "a1",
  actions: [
    { id: "draft", label: "Draft", message: "Draft it." },
    { id: "share", label: "Share", message: "Share it." },
  ],
};

describe("resolveSuggestActionsOverride", () => {
  it("renders actions until this offer is dismissed", () => {
    deepStrictEqual(resolveSuggestActionsOverride([actions], null), {
      kind: "bubbles",
      step: actions,
    });
    deepStrictEqual(resolveSuggestActionsOverride([actions], "a1"), {
      kind: "none",
    });
  });

  it("coexists with the optional reusable offer", () => {
    const reusable: InteractionStep = {
      kind: "suggest_reusable",
      id: "r1",
      reusableKind: "skill",
      title: "Weekly summary",
      rationale: "Useful every week.",
    };
    deepStrictEqual(resolveSuggestActionsOverride([actions, reusable], null), {
      kind: "bubbles",
      step: actions,
    });
  });

  it("returns none when a blocking step is present", () => {
    const question: InteractionStep = {
      kind: "question",
      id: "q1",
      question: "Which account?",
    };
    deepStrictEqual(resolveSuggestActionsOverride([actions, question], null), {
      kind: "none",
    });
  });
});
