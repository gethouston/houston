import { expect, test } from "vitest";
import {
  newInteractionHolder,
  recordPendingInteraction,
  runWithInteractionCapture,
} from "./interaction";

/**
 * The per-turn pending-interaction holder: an AsyncLocalStorage store the
 * ask_user / request_connection tools write into while a turn's prompt runs.
 * These pin: last-call-wins within a turn, a fresh holder per turn IS the reset,
 * and recording outside a turn is a silent no-op.
 */

test("records the interaction on the ambient holder", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordPendingInteraction({
      kind: "question",
      questions: [{ id: "q1", question: "Which one?" }],
    });
  });
  expect(holder.pending).toEqual({
    kind: "question",
    questions: [{ id: "q1", question: "Which one?" }],
  });
});

test("last call wins within a single turn", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordPendingInteraction({
      kind: "question",
      questions: [{ id: "q1", question: "first?" }],
    });
    recordPendingInteraction({ kind: "connect", toolkit: "gmail" });
    recordPendingInteraction({
      kind: "question",
      questions: [{ id: "q1", question: "final?" }],
    });
  });
  expect(holder.pending).toEqual({
    kind: "question",
    questions: [{ id: "q1", question: "final?" }],
  });
});

test("a fresh holder each turn is the reset — nothing leaks across turns", () => {
  const first = newInteractionHolder();
  runWithInteractionCapture(first, () => {
    recordPendingInteraction({ kind: "connect", toolkit: "slack" });
  });
  expect(first.pending).toEqual({ kind: "connect", toolkit: "slack" });

  // A second turn starts with its own empty holder and never sees the first.
  const second = newInteractionHolder();
  expect(second.pending).toBeUndefined();
  runWithInteractionCapture(second, () => {
    // records nothing this turn
  });
  expect(second.pending).toBeUndefined();
});

test("recording outside a turn is a no-op (undefined store)", () => {
  // No runWithInteractionCapture → getStore() is undefined → nothing recorded.
  expect(() =>
    recordPendingInteraction({
      kind: "question",
      questions: [{ id: "q1", question: "orphan?" }],
    }),
  ).not.toThrow();
});

test("the holder survives async work inside the capture (ALS propagation)", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await Promise.resolve();
    recordPendingInteraction({
      kind: "question",
      questions: [{ id: "q1", question: "after await?" }],
    });
  });
  expect(holder.pending).toEqual({
    kind: "question",
    questions: [{ id: "q1", question: "after await?" }],
  });
});
