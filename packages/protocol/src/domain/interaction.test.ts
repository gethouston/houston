import { expect, expectTypeOf, test } from "vitest";
import {
  HANDS_ON_SURFACES,
  type HandsOnSurface,
  hasOnlySuggestionSteps,
  isHandsOnSurface,
  isInteractionStep,
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

  expect(isPendingInteraction({ steps: [{ kind: "signin", id: "s1" }] })).toBe(
    true,
  );

  expect(
    isPendingInteraction({
      steps: [{ kind: "plan_ready", id: "p1", summary: "The plan." }],
    }),
  ).toBe(true);
  expect(
    isPendingInteraction({ steps: [{ kind: "plan_ready", id: "p1" }] }),
  ).toBe(false);
  expect(
    isPendingInteraction({
      steps: [{ kind: "plan_ready", id: "p1", summary: 7 }],
    }),
  ).toBe(false);

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

  expect(
    isPendingInteraction({ steps: [{ kind: "signin", id: "s1", reason: 7 }] }),
  ).toBe(false);
  expect(isPendingInteraction({ steps: [{ kind: "signin" }] })).toBe(false);

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

  expect(
    isPendingInteraction({
      steps: [
        { kind: "question", id: "q1", question: "Send it?", toolkit: 42 },
      ],
    }),
  ).toBe(false);

  expect(
    isPendingInteraction({
      steps: [{ kind: "question", id: "q1", question: "Which week?" }],
    }),
  ).toBe(true);
});

test("an unrecognized step kind is DROPPED, not fatal (mixed-version peer)", () => {
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
  expect(isPendingInteraction(withUnknown)).toBe(true);

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

  expect(parsePendingInteraction({ kind: "question" })).toBeUndefined();
  expect(parsePendingInteraction(null)).toBeUndefined();
});

test("question options tolerate the optional description/recommended fields", () => {
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
  expect(hasOnlySuggestionSteps([])).toBe(false);
});

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
  const malformed = { kind: "question", question: "Which deck?" };
  expect(
    resolveInteractionPatch({
      patched: malformed,
      stored: { steps: [QUESTION_STEP, ACTIONS_STEP] },
      status: "done",
    }),
  ).toEqual({ kind: "set", interaction: { steps: [ACTIONS_STEP] } });
  expect(
    resolveInteractionPatch({
      patched: malformed,
      stored: { steps: [QUESTION_STEP] },
      status: "needs_you",
    }),
  ).toEqual({ kind: "keep" });
});

test("a hands-on errand survives the wire guard and keeps its optional reason", () => {
  const step = {
    kind: "hands_on",
    id: "h1",
    surface: "apiKeys",
    reason: "Copy the key Houston shows you once.",
  };
  expect(isPendingInteraction({ steps: [step] })).toBe(true);
  expect(parsePendingInteraction({ steps: [step] })).toEqual({ steps: [step] });
  expect(
    isPendingInteraction({
      steps: [{ kind: "hands_on", id: "h1", surface: "billing" }],
    }),
  ).toBe(true);
  for (const malformed of [
    { kind: "hands_on", id: "h1" },
    { ...step, surface: "" },
    { ...step, surface: 3 },
    { ...step, reason: 3 },
  ])
    expect(isInteractionStep(malformed)).toBe(false);
});

test("an errand on ONE employee's screen carries that employee, additively", () => {
  const step = {
    kind: "hands_on",
    id: "h1",
    surface: "agentApiAccess",
    agentId: "agent-7",
    reason: "Copy the setup prompt for your coding tool.",
  };
  expect(parsePendingInteraction({ steps: [step] })).toEqual({ steps: [step] });
  const { agentId: _omitted, ...withoutAgent } = step;
  expect(isInteractionStep(withoutAgent)).toBe(true);
  for (const agentId of ["", 7, null])
    expect(isInteractionStep({ ...step, agentId })).toBe(false);
});

test("the hands-on vocabulary is closed and its guard agrees with the union", () => {
  expect([...HANDS_ON_SURFACES]).toEqual([
    "apiKeys",
    "billing",
    "files",
    "routineWebhook",
    "orgDanger",
    "agentApiAccess",
  ]);
  for (const surface of HANDS_ON_SURFACES)
    expect(isHandsOnSurface(surface)).toBe(true);
  for (const junk of ["", "settings", "toString", 7, null, undefined])
    expect(isHandsOnSurface(junk)).toBe(false);
  expectTypeOf<
    (typeof HANDS_ON_SURFACES)[number]
  >().toEqualTypeOf<HandsOnSurface>();
});

test("a hands-on errand is a BLOCKING step, void once the user closes the mission", () => {
  const errand = { kind: "hands_on", id: "h1", surface: "billing" } as const;
  expect(hasOnlySuggestionSteps([errand])).toBe(false);
  expect(
    resolveInteractionPatch({
      patched: undefined,
      stored: { steps: [errand] },
      status: "done",
    }),
  ).toEqual({ kind: "clear" });
});

test("a question step's wantsFiles flag is optional and must be a boolean", () => {
  const question = { kind: "question", id: "q1", question: "Send the logo?" };
  expect(isInteractionStep(question)).toBe(true);
  expect(isInteractionStep({ ...question, wantsFiles: true })).toBe(true);
  expect(isInteractionStep({ ...question, wantsFiles: false })).toBe(true);
  expect(isInteractionStep({ ...question, wantsFiles: "yes" })).toBe(false);
  expect(
    parsePendingInteraction({ steps: [{ ...question, wantsFiles: true }] }),
  ).toEqual({ steps: [{ ...question, wantsFiles: true }] });
});

test("a connect step may carry a boolean reconnect flag, nothing else", () => {
  const step = (reconnect: unknown) => ({
    steps: [{ kind: "connect", id: "c1", toolkit: "apify", reconnect }],
  });
  expect(isPendingInteraction(step(true))).toBe(true);
  expect(isPendingInteraction(step(undefined))).toBe(true);
  expect(isPendingInteraction(step("yes"))).toBe(false);
  const refused = (refusedAt: unknown) => ({
    steps: [
      {
        kind: "connect",
        id: "c1",
        toolkit: "apify",
        reconnect: true,
        refusedAt,
      },
    ],
  });
  expect(isPendingInteraction(refused("2026-11-18T21:00:00Z"))).toBe(true);
  expect(isPendingInteraction(refused(1))).toBe(false);
});
