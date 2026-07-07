import { expect, expectTypeOf, test } from "vitest";
import { isPendingInteraction, type PendingInteraction } from "../index";

test("isPendingInteraction accepts the step-sequence shape and rejects legacy shapes", () => {
  expect(
    isPendingInteraction({
      steps: [
        { kind: "question", id: "q1", question: "Which deck?" },
        { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send it" },
      ],
    }),
  ).toBe(true);

  // Pre-step shapes persisted by older builds: no `steps`.
  expect(
    isPendingInteraction({ kind: "question", question: "Which deck?" }),
  ).toBe(false);
  expect(
    isPendingInteraction({
      kind: "question",
      questions: [{ id: "q1", question: "Which deck?" }],
    }),
  ).toBe(false);
  expect(isPendingInteraction({ kind: "connect", toolkit: "gmail" })).toBe(
    false,
  );

  // Structural junk.
  expect(isPendingInteraction(null)).toBe(false);
  expect(isPendingInteraction(undefined)).toBe(false);
  expect(isPendingInteraction({ steps: [] })).toBe(false);
  expect(isPendingInteraction({ steps: [{ kind: "question" }] })).toBe(false);
  expect(isPendingInteraction({ steps: [{ kind: "connect", id: "c1" }] })).toBe(
    false,
  );
});

test("the protocol index re-exports PendingInteraction", () => {
  const pending: PendingInteraction = {
    steps: [
      { kind: "question", id: "q1", question: "Which slide deck?" },
      {
        id: "q2",
        kind: "question",
        question: "Send it now?",
        options: [{ id: "yes", label: "Send" }],
      },
      { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send it" },
    ],
  };

  expectTypeOf(pending).toMatchTypeOf<PendingInteraction>();
  // @ts-expect-error — a step's `kind` is the discriminant; other values are not assignable
  const bad: PendingInteraction = { steps: [{ kind: "unknown" }] };
  void bad;
});
