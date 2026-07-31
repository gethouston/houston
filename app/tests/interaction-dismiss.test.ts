import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { InteractionStep, PendingInteraction } from "@houston/protocol";
import {
  type DismissalWrite,
  foldDismissal,
  removeInteractionStep,
} from "../src/lib/interaction-dismiss.ts";

const ACTIONS_STEP: InteractionStep = {
  kind: "suggest_actions",
  id: "a1",
  actions: [
    { id: "x", label: "Send it", message: "Send the deck" },
    { id: "y", label: "Draft a note", message: "Draft the note" },
  ],
};
const REUSABLE_STEP: InteractionStep = {
  kind: "suggest_reusable",
  id: "r1",
  reusableKind: "skill",
  title: "Weekly deck",
  rationale: "You do this every week.",
};

describe("removeInteractionStep", () => {
  it("keeps the sibling offer when one is dismissed", () => {
    deepStrictEqual(
      removeInteractionStep({ steps: [ACTIONS_STEP, REUSABLE_STEP] }, "a1"),
      { steps: [REUSABLE_STEP] },
    );
    deepStrictEqual(
      removeInteractionStep({ steps: [ACTIONS_STEP, REUSABLE_STEP] }, "r1"),
      { steps: [ACTIONS_STEP] },
    );
  });

  it("returns null when the last step is dismissed", () => {
    strictEqual(removeInteractionStep({ steps: [ACTIONS_STEP] }, "a1"), null);
  });

  it("returns the same interaction when the id matches nothing", () => {
    const interaction = { steps: [ACTIONS_STEP, REUSABLE_STEP] };
    strictEqual(removeInteractionStep(interaction, "nope"), interaction);
  });

  it("preserves the order of the surviving steps", () => {
    const question: InteractionStep = {
      kind: "question",
      id: "q1",
      question: "Which deck?",
    };
    deepStrictEqual(
      removeInteractionStep(
        { steps: [question, ACTIONS_STEP, REUSABLE_STEP] },
        "a1",
      ),
      { steps: [question, REUSABLE_STEP] },
    );
  });
});

/**
 * The panel dismisses against the LIVE (settle-time) interaction, which a
 * persist never rewrites. Dismissing both offers one after the other therefore
 * has to chain — or the second write resurrects the first offer on reload.
 */
describe("foldDismissal", () => {
  const both: PendingInteraction = { steps: [ACTIONS_STEP, REUSABLE_STEP] };

  it("composes two dismissals of the same interaction: {a1,r1} -> {r1} -> none", () => {
    const first = foldDismissal(null, both, "a1");
    deepStrictEqual(first, { base: both, written: { steps: [REUSABLE_STEP] } });

    // The SAME live interaction is passed again — the panel re-renders from the
    // settle-time sequence, not from what was just persisted.
    const second = foldDismissal(first, both, "r1");
    deepStrictEqual(second, { base: both, written: null });
  });

  it("does not resurrect the first offer when the second is dismissed", () => {
    const first = foldDismissal(null, both, "r1");
    const second = foldDismissal(first, both, "a1");
    // The regression this guards: {a1,r1} - a1 = {r1}, bringing back the
    // save-as-reusable card the user had already skipped.
    strictEqual(second?.written, null);
  });

  it("writes nothing when the step is already gone", () => {
    const first = foldDismissal(null, both, "a1");
    strictEqual(foldDismissal(first, both, "a1"), null);
  });

  it("writes nothing when the id matches no step at all", () => {
    strictEqual(foldDismissal(null, both, "nope"), null);
  });

  it("writes nothing once everything has been dismissed", () => {
    const cleared: DismissalWrite = { base: both, written: null };
    strictEqual(foldDismissal(cleared, both, "r1"), null);
  });

  it("starts a fresh chain when a later turn re-arms the SAME step ids", () => {
    // `a1` / `r1` are tool-assigned and repeat every turn, so the chain is keyed
    // on the interaction's identity: a new turn's object must not inherit the
    // previous turn's remainder (which would wipe the sibling offer).
    const previousTurn = foldDismissal(null, both, "a1");
    const nextTurn: PendingInteraction = {
      steps: [ACTIONS_STEP, REUSABLE_STEP],
    };
    deepStrictEqual(foldDismissal(previousTurn, nextTurn, "a1"), {
      base: nextTurn,
      written: { steps: [REUSABLE_STEP] },
    });
  });

  it("chains from the persisted remainder after a reload (no prior write)", () => {
    // A reload renders the persisted remainder itself, so the first dismissal
    // after it starts from `{r1}` and clears the interaction outright.
    const remainder: PendingInteraction = { steps: [REUSABLE_STEP] };
    deepStrictEqual(foldDismissal(null, remainder, "r1"), {
      base: remainder,
      written: null,
    });
  });
});
