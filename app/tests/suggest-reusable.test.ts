import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { InteractionStep } from "@houston/protocol";
import { resolveSuggestReusableOverride } from "../src/lib/suggest-reusable.ts";

const suggest: InteractionStep = {
  kind: "suggest_reusable",
  id: "r1",
  reusableKind: "skill",
  title: "Weekly investor update",
  rationale: "You will likely want to repeat this every week.",
};
const question: InteractionStep = {
  kind: "question",
  id: "q1",
  question: "Which account?",
};

describe("resolveSuggestReusableOverride", () => {
  it("renders the card for a lone, undismissed suggest_reusable step", () => {
    deepStrictEqual(resolveSuggestReusableOverride([suggest], null), {
      kind: "card",
      step: suggest,
    });
  });

  it("returns none once THIS offer is dismissed (Not now)", () => {
    deepStrictEqual(resolveSuggestReusableOverride([suggest], suggest.id), {
      kind: "none",
    });
  });

  it("re-shows the card for a later, different offer", () => {
    const next: InteractionStep = {
      kind: "suggest_reusable",
      id: "r2",
      reusableKind: "routine",
      title: "Daily standup digest",
      rationale: "This runs on a schedule.",
    };
    deepStrictEqual(resolveSuggestReusableOverride([next], suggest.id), {
      kind: "card",
      step: next,
    });
  });

  it("returns none when the sole step is not a suggest_reusable step", () => {
    deepStrictEqual(resolveSuggestReusableOverride([question], null), {
      kind: "none",
    });
  });

  it("returns none for a multi-step sequence (never coexists by construction)", () => {
    deepStrictEqual(resolveSuggestReusableOverride([question, suggest], null), {
      kind: "none",
    });
  });

  it("returns none for an empty sequence", () => {
    deepStrictEqual(resolveSuggestReusableOverride([], null), { kind: "none" });
  });
});
