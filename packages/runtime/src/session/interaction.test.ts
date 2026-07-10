import { isInteractionStep } from "@houston/protocol";
import { expect, test } from "vitest";
import {
  newInteractionHolder,
  recordConnection,
  recordPlanReady,
  recordQuestions,
  recordSignin,
  recordSuggestReusable,
  runWithInteractionCapture,
} from "./interaction";

/**
 * The per-turn interaction holder: an AsyncLocalStorage store the ask_user /
 * request_connection tools write into while a turn's prompt runs. These pin the
 * merge semantics: ask_user REPLACES the question steps, request_connection
 * APPENDS a deduped connect step, the recorded sequence is questions-then-
 * connects, a fresh holder per turn IS the reset, and recording outside a turn
 * is a silent no-op.
 */

const q = (id: string, question: string) =>
  ({ kind: "question", id, question }) as const;

test("ask_user question steps become the pending sequence", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordQuestions([q("q1", "Which one?")]);
  });
  expect(holder.pending).toEqual({ steps: [q("q1", "Which one?")] });
});

test("request_connection appends a connect step after the questions", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordQuestions([q("q1", "Which address?"), q("q2", "What content?")]);
    recordConnection({ toolkit: "gmail", reason: "to send it" });
  });
  // Question steps first (in ask_user order), then the connect step.
  expect(holder.pending).toEqual({
    steps: [
      q("q1", "Which address?"),
      q("q2", "What content?"),
      { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send it" },
    ],
  });
});

test("a second ask_user call REPLACES the question steps", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordQuestions([q("q1", "first?"), q("q2", "also?")]);
    recordQuestions([q("q1", "final?")]);
  });
  expect(holder.pending).toEqual({ steps: [q("q1", "final?")] });
});

test("connect steps dedupe by toolkit, keep call order, and take c1..cN ids", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordConnection({ toolkit: "gmail" });
    recordConnection({ toolkit: "slack", reason: "to post" });
    // A repeat of gmail keeps its id + position and updates its reason.
    recordConnection({ toolkit: "gmail", reason: "to send the email" });
  });
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "connect",
        id: "c1",
        toolkit: "gmail",
        reason: "to send the email",
      },
      { kind: "connect", id: "c2", toolkit: "slack", reason: "to post" },
    ],
  });
});

test("recordSignin orders the signin step between questions and connects", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordConnection({ toolkit: "gmail", reason: "to send it" });
    recordSignin({ reason: "Sign in first." });
    recordQuestions([q("q1", "Which address?")]);
  });
  // Regardless of call order: questions, then the signin step, then connects.
  expect(holder.pending).toEqual({
    steps: [
      q("q1", "Which address?"),
      { kind: "signin", id: "s1", reason: "Sign in first." },
      { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send it" },
    ],
  });
});

test("recordSignin is idempotent — one step, last reason wins", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordSignin({ reason: "first reason" });
    recordSignin({ reason: "  second reason  " });
  });
  expect(holder.pending).toEqual({
    steps: [{ kind: "signin", id: "s1", reason: "second reason" }],
  });
});

test("recordSignin omits an empty/whitespace reason", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordSignin({ reason: "   " });
  });
  expect(holder.pending).toEqual({ steps: [{ kind: "signin", id: "s1" }] });

  const noReason = newInteractionHolder();
  runWithInteractionCapture(noReason, () => recordSignin({}));
  expect(noReason.pending).toEqual({ steps: [{ kind: "signin", id: "s1" }] });
});

test("a signin step alone yields a valid sequence", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => recordSignin({ reason: "Sign in." }));
  expect(holder.pending).toEqual({
    steps: [{ kind: "signin", id: "s1", reason: "Sign in." }],
  });
});

test("either tool alone still yields a valid sequence", () => {
  const questionsOnly = newInteractionHolder();
  runWithInteractionCapture(questionsOnly, () =>
    recordQuestions([q("q1", "Which one?")]),
  );
  expect(questionsOnly.pending).toEqual({ steps: [q("q1", "Which one?")] });

  const connectOnly = newInteractionHolder();
  runWithInteractionCapture(connectOnly, () =>
    recordConnection({ toolkit: "notion" }),
  );
  expect(connectOnly.pending).toEqual({
    steps: [{ kind: "connect", id: "c1", toolkit: "notion" }],
  });
});

test("a fresh holder each turn is the reset — nothing leaks across turns", () => {
  const first = newInteractionHolder();
  runWithInteractionCapture(first, () =>
    recordConnection({ toolkit: "slack" }),
  );
  expect(first.pending).toEqual({
    steps: [{ kind: "connect", id: "c1", toolkit: "slack" }],
  });

  // A second turn starts with its own empty holder and never sees the first.
  const second = newInteractionHolder();
  expect(second.pending).toBeUndefined();
  runWithInteractionCapture(second, () => {
    // records nothing this turn
  });
  expect(second.pending).toBeUndefined();
});

test("recording outside a turn is a no-op (undefined store)", () => {
  expect(() => recordQuestions([q("q1", "orphan?")])).not.toThrow();
  expect(() => recordConnection({ toolkit: "gmail" })).not.toThrow();
  expect(() => recordSignin({ reason: "orphan" })).not.toThrow();
  expect(() => recordPlanReady({ summary: "orphan plan" })).not.toThrow();
  expect(() =>
    recordSuggestReusable({
      reusableKind: "skill",
      title: "orphan",
      rationale: "no turn",
    }),
  ).not.toThrow();
});

test("recordPlanReady records the single plan-ready step (id p1, trimmed)", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () =>
    recordPlanReady({ summary: "  Book it, then confirm.  " }),
  );
  expect(holder.pending).toEqual({
    steps: [
      { kind: "plan_ready", id: "p1", summary: "Book it, then confirm." },
    ],
  });
});

test("a plan-ready step OWNS the interaction exclusively (wins over queued steps)", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    // Even if the model somehow queued questions/signin/connects this turn, a
    // plan_ready call collapses the interaction to the single plan card.
    recordQuestions([q("q1", "Which one?")]);
    recordSignin({ reason: "Sign in first." });
    recordConnection({ toolkit: "gmail", reason: "to send it" });
    recordPlanReady({ summary: "Here is the plan." });
  });
  expect(holder.pending).toEqual({
    steps: [{ kind: "plan_ready", id: "p1", summary: "Here is the plan." }],
  });
});

test("the protocol guard accepts a valid plan_ready step and rejects a bad summary", () => {
  // Guard coverage lands here because @houston/protocol has no test runner of
  // its own; the runtime suite imports the same guard the wire/persist seams use.
  expect(
    isInteractionStep({ kind: "plan_ready", id: "p1", summary: "The plan." }),
  ).toBe(true);
  // A missing summary is invalid.
  expect(isInteractionStep({ kind: "plan_ready", id: "p1" })).toBe(false);
  // A non-string summary is invalid.
  expect(isInteractionStep({ kind: "plan_ready", id: "p1", summary: 7 })).toBe(
    false,
  );
  // No id is invalid (shared step rule).
  expect(isInteractionStep({ kind: "plan_ready", summary: "x" })).toBe(false);
});

test("recordSuggestReusable records the single suggest-reusable step (id r1, trimmed)", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () =>
    recordSuggestReusable({
      reusableKind: "routine",
      title: "  Morning digest  ",
      rationale: "  Runs on its own each day.  ",
    }),
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "routine",
        title: "Morning digest",
        rationale: "Runs on its own each day.",
      },
    ],
  });
});

test("a suggest-reusable step ALONE surfaces as the pending sequence", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () =>
    recordSuggestReusable({
      reusableKind: "skill",
      title: "Weekly report",
      rationale: "Reuse it next week.",
    }),
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "suggest_reusable",
        id: "r1",
        reusableKind: "skill",
        title: "Weekly report",
        rationale: "Reuse it next week.",
      },
    ],
  });
});

test("suggest-reusable is FALLBACK-ONLY: a question this same turn wins and drops it", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordSuggestReusable({
      reusableKind: "skill",
      title: "Weekly report",
      rationale: "Reuse it next week.",
    });
    recordQuestions([q("q1", "Which week?")]);
  });
  // The question means the mission is NOT done, so it takes priority and the
  // suggestion is dropped from `pending` entirely — never surfaced alongside.
  expect(holder.pending).toEqual({ steps: [q("q1", "Which week?")] });
});

test("plan-ready wins over a suggest-reusable step set the same turn", () => {
  const holder = newInteractionHolder();
  runWithInteractionCapture(holder, () => {
    recordSuggestReusable({
      reusableKind: "skill",
      title: "Weekly report",
      rationale: "Reuse it next week.",
    });
    recordPlanReady({ summary: "Here is the plan." });
  });
  expect(holder.pending).toEqual({
    steps: [{ kind: "plan_ready", id: "p1", summary: "Here is the plan." }],
  });
});

test("the holder survives async work inside the capture (ALS propagation)", async () => {
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, async () => {
    await Promise.resolve();
    recordQuestions([q("q1", "after await?")]);
    recordConnection({ toolkit: "gmail" });
  });
  expect(holder.pending).toEqual({
    steps: [
      q("q1", "after await?"),
      { kind: "connect", id: "c1", toolkit: "gmail" },
    ],
  });
});
