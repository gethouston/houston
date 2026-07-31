import { expect, expectTypeOf, test } from "vitest";
import {
  hasOnlySuggestionSteps,
  isPendingInteraction,
  type PendingInteraction,
  parsePendingInteraction,
  resolveInteractionPatch,
} from "../index";

test("isPendingInteraction accepts the step-sequence shape and rejects legacy shapes", () => {
  expect(
    isPendingInteraction({
      steps: [
        { kind: "question", id: "q1", question: "Which deck?" },
        { kind: "signin", id: "s1", reason: "Sign in to use your apps." },
        { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send it" },
      ],
    }),
  ).toBe(true);

  // A signin step needs only kind + id; reason is optional.
  expect(isPendingInteraction({ steps: [{ kind: "signin", id: "s1" }] })).toBe(
    true,
  );

  // A plan_ready step needs kind + id + a string summary.
  expect(
    isPendingInteraction({
      steps: [{ kind: "plan_ready", id: "p1", summary: "The plan." }],
    }),
  ).toBe(true);
  // A plan_ready step with a missing / non-string summary is invalid.
  expect(
    isPendingInteraction({ steps: [{ kind: "plan_ready", id: "p1" }] }),
  ).toBe(false);
  expect(
    isPendingInteraction({
      steps: [{ kind: "plan_ready", id: "p1", summary: 7 }],
    }),
  ).toBe(false);

  // A suggest_reusable step needs kind + id + reusableKind + title + rationale.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "suggest_reusable",
          id: "r1",
          reusableKind: "skill",
          title: "Weekly report digest",
          rationale: "This multi-step task looks reusable.",
        },
      ],
    }),
  ).toBe(true);
  // A learning suggestion (the reflection step's third kind) is valid.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "suggest_reusable",
          id: "r1",
          reusableKind: "learning",
          title: "Preferred report format",
          rationale: "You always want the summary first.",
        },
      ],
    }),
  ).toBe(true);
  // An invalid reusableKind is invalid.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "suggest_reusable",
          id: "r1",
          reusableKind: "workflow",
          title: "x",
          rationale: "x",
        },
      ],
    }),
  ).toBe(false);
  // A missing title/rationale is invalid.
  expect(
    isPendingInteraction({
      steps: [{ kind: "suggest_reusable", id: "r1", reusableKind: "routine" }],
    }),
  ).toBe(false);

  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "suggest_actions",
          id: "a1",
          actions: [
            { id: "one", label: "Draft it", message: "Draft the email." },
            { id: "two", label: "Share it", message: "Share the update." },
          ],
        },
      ],
    }),
  ).toBe(true);
  expect(
    isPendingInteraction({
      steps: [{ kind: "suggest_actions", id: "a1", actions: [] }],
    }),
  ).toBe(false);
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "suggest_actions",
          id: "a1",
          actions: Array.from({ length: 5 }, (_, index) => ({
            id: `action-${index}`,
            label: "Next step",
            message: "Continue.",
          })),
        },
      ],
    }),
  ).toBe(false);
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "suggest_actions",
          id: "a1",
          actions: [
            { id: "one", label: 1, message: "Continue." },
            { id: "two", label: "Two", message: "Continue." },
          ],
        },
      ],
    }),
  ).toBe(false);

  // A signin step with a non-string reason is invalid.
  expect(
    isPendingInteraction({ steps: [{ kind: "signin", id: "s1", reason: 7 }] }),
  ).toBe(false);
  // A signin step without an id is invalid.
  expect(isPendingInteraction({ steps: [{ kind: "signin" }] })).toBe(false);

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

test("a whole interaction mixing question → signin → connect is accepted", () => {
  expect(
    isPendingInteraction({
      steps: [
        { kind: "question", id: "q1", question: "Which draft?" },
        { kind: "signin", id: "s1" },
        { kind: "connect", id: "c1", toolkit: "gmail" },
      ],
    }),
  ).toBe(true);
});

test("a question step carries an optional toolkit slug", () => {
  // The card brands itself with the app's logo when the question confirms an
  // app action: a string toolkit is accepted.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "question",
          id: "q1",
          question: "Should I send the 30 invites?",
          toolkit: "gmail",
          options: [
            { id: "send", label: "Send it", recommended: true },
            { id: "no", label: "Don't send" },
          ],
        },
      ],
    }),
  ).toBe(true);

  // A non-string toolkit is invalid.
  expect(
    isPendingInteraction({
      steps: [
        { kind: "question", id: "q1", question: "Send it?", toolkit: 42 },
      ],
    }),
  ).toBe(false);

  // Omitting toolkit is fine — most questions concern no app.
  expect(
    isPendingInteraction({
      steps: [{ kind: "question", id: "q1", question: "Which week?" }],
    }),
  ).toBe(true);
});

test("an unrecognized step kind is DROPPED, not fatal (mixed-version peer)", () => {
  // A peer on an older build carries a step kind this build no longer knows
  // (e.g. the retired `approval` step). The parse keeps the valid steps and
  // drops the unknown one — the card still renders — never throwing.
  const withUnknown = {
    steps: [
      { kind: "question", id: "q1", question: "Which draft?" },
      {
        kind: "approval",
        id: "a1",
        toolkit: "gmail",
        action: "GMAIL_SEND_DRAFT",
        paramsHash: "h7f3a1",
      },
      { kind: "connect", id: "c1", toolkit: "gmail" },
    ],
  };
  expect(parsePendingInteraction(withUnknown)).toEqual({
    steps: [
      { kind: "question", id: "q1", question: "Which draft?" },
      { kind: "connect", id: "c1", toolkit: "gmail" },
    ],
  });
  // The boolean guard stays tolerant: valid steps survive → not absent.
  expect(isPendingInteraction(withUnknown)).toBe(true);

  // An interaction of ONLY unknown steps drops to undefined (nothing to render).
  expect(
    parsePendingInteraction({
      steps: [{ kind: "approval", id: "a1", toolkit: "gmail" }],
    }),
  ).toBeUndefined();
  expect(
    isPendingInteraction({
      steps: [{ kind: "approval", id: "a1", toolkit: "gmail" }],
    }),
  ).toBe(false);

  // No `steps` array at all → undefined, never a throw.
  expect(parsePendingInteraction({ kind: "question" })).toBeUndefined();
  expect(parsePendingInteraction(null)).toBeUndefined();
});

test("question options tolerate the optional description/recommended fields", () => {
  // Options carrying the new optional fields still pass the guard.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "question",
          id: "q1",
          question: "Which plan?",
          options: [
            {
              id: "pro",
              label: "Pro",
              description: "Unlocks everything.",
              recommended: true,
            },
            { id: "free", label: "Free" },
          ],
        },
      ],
    }),
  ).toBe(true);

  // Plain {id,label} options (no new fields) still pass unchanged.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "question",
          id: "q1",
          question: "Which plan?",
          options: [
            { id: "pro", label: "Pro" },
            { id: "free", label: "Free" },
          ],
        },
      ],
    }),
  ).toBe(true);

  // The guard does not REQUIRE the new fields: a question step with no
  // options at all remains valid.
  expect(
    isPendingInteraction({
      steps: [{ kind: "question", id: "q1", question: "Open question?" }],
    }),
  ).toBe(true);
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
      { kind: "signin", id: "s1", reason: "Sign in first." },
      { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send it" },
    ],
  };

  expectTypeOf(pending).toMatchTypeOf<PendingInteraction>();
  // @ts-expect-error — a step's `kind` is the discriminant; other values are not assignable
  const bad: PendingInteraction = { steps: [{ kind: "unknown" }] };
  void bad;
});

// ── The offers-only predicate ───────────────────────────────────────────────
// One spelling for "nothing blocking here", so the surfaces that gate on it
// (the chat panel's override, the two offer resolvers) can never disagree.

const ACTIONS_STEP = {
  kind: "suggest_actions" as const,
  id: "a1",
  actions: [
    { id: "x", label: "Send it", message: "Send the deck" },
    { id: "y", label: "Draft a note", message: "Draft the note" },
  ],
};
const REUSABLE_STEP = {
  kind: "suggest_reusable" as const,
  id: "r1",
  reusableKind: "skill" as const,
  title: "Weekly deck",
  rationale: "You do this every week.",
};
const QUESTION_STEP = {
  kind: "question" as const,
  id: "q1",
  question: "Which deck?",
};

test("hasOnlySuggestionSteps is true only for a non-empty, blocking-free sequence", () => {
  expect(hasOnlySuggestionSteps([ACTIONS_STEP])).toBe(true);
  expect(hasOnlySuggestionSteps([ACTIONS_STEP, REUSABLE_STEP])).toBe(true);
  expect(hasOnlySuggestionSteps([QUESTION_STEP, ACTIONS_STEP])).toBe(false);
  expect(hasOnlySuggestionSteps([QUESTION_STEP])).toBe(false);
  expect(
    hasOnlySuggestionSteps([{ kind: "connect", id: "c1", toolkit: "gmail" }]),
  ).toBe(false);
  // An empty sequence offers nothing — `every` alone would call it true.
  expect(hasOnlySuggestionSteps([])).toBe(false);
});

// ── The shared PATCH rule ───────────────────────────────────────────────────
// The host, the app's local write path and the fake host all resolve through
// this, so the three can never drift.

test("resolveInteractionPatch: null clears, a valid object replaces verbatim", () => {
  expect(
    resolveInteractionPatch({
      patched: null,
      stored: { steps: [ACTIONS_STEP] },
      status: undefined,
    }),
  ).toEqual({ kind: "clear" });

  const patched = { steps: [REUSABLE_STEP] };
  const outcome = resolveInteractionPatch({
    patched,
    stored: { steps: [ACTIONS_STEP] },
    status: "done",
  });
  expect(outcome).toEqual({ kind: "set", interaction: patched });
  // Verbatim: a step kind only a newer peer knows survives the round-trip.
  if (outcome.kind === "set") expect(outcome.interaction).toBe(patched);
});

test("resolveInteractionPatch: an absent field keeps, except on a move to done", () => {
  const stored = { steps: [QUESTION_STEP, ACTIONS_STEP] };
  expect(
    resolveInteractionPatch({
      patched: undefined,
      stored,
      status: "needs_you",
    }),
  ).toEqual({ kind: "keep" });
  expect(
    resolveInteractionPatch({ patched: undefined, stored, status: undefined }),
  ).toEqual({ kind: "keep" });
  expect(
    resolveInteractionPatch({ patched: undefined, stored, status: "done" }),
  ).toEqual({ kind: "set", interaction: { steps: [ACTIONS_STEP] } });
  expect(
    resolveInteractionPatch({
      patched: undefined,
      stored: { steps: [QUESTION_STEP] },
      status: "done",
    }),
  ).toEqual({ kind: "clear" });
});

test("resolveInteractionPatch: a MALFORMED payload is absent, never 'keep what's stored'", () => {
  // A pre-step build's shape: no `steps` at all. Left as "keep", a done patch
  // carrying it would skip the strip and leave a question stepper on a Done card.
  const malformed = { kind: "question", question: "Which deck?" };
  expect(
    resolveInteractionPatch({
      patched: malformed,
      stored: { steps: [QUESTION_STEP, ACTIONS_STEP] },
      status: "done",
    }),
  ).toEqual({ kind: "set", interaction: { steps: [ACTIONS_STEP] } });
  // Off a done patch it still says nothing: the stored value stands.
  expect(
    resolveInteractionPatch({
      patched: malformed,
      stored: { steps: [QUESTION_STEP] },
      status: "needs_you",
    }),
  ).toEqual({ kind: "keep" });
});
