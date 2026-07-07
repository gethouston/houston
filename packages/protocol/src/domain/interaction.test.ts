import { expectTypeOf, test } from "vitest";
import type { PendingInteraction } from "../index";

test("the protocol index re-exports PendingInteraction", () => {
  const question: PendingInteraction = {
    kind: "question",
    questions: [
      { id: "q1", question: "Which slide deck?" },
      {
        id: "q2",
        question: "Send it now?",
        options: [{ id: "yes", label: "Send" }],
      },
    ],
  };
  const connect: PendingInteraction = { kind: "connect", toolkit: "gmail" };

  expectTypeOf(question).toMatchTypeOf<PendingInteraction>();
  expectTypeOf(connect).toMatchTypeOf<PendingInteraction>();
  // @ts-expect-error — `kind` is the discriminant; other values are not assignable
  const bad: PendingInteraction = { kind: "unknown" };
  void bad;
});
