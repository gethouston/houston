import { expectTypeOf, test } from "vitest";
import type { PendingInteraction } from "../index";

test("the protocol index re-exports PendingInteraction", () => {
  const question: PendingInteraction = {
    kind: "question",
    question: "Which slide deck?",
    options: [{ id: "q2", label: "Q2 review" }],
  };
  const connect: PendingInteraction = { kind: "connect", toolkit: "gmail" };

  expectTypeOf(question).toMatchTypeOf<PendingInteraction>();
  expectTypeOf(connect).toMatchTypeOf<PendingInteraction>();
  // @ts-expect-error — `kind` is the discriminant; other values are not assignable
  const bad: PendingInteraction = { kind: "unknown" };
  void bad;
});
