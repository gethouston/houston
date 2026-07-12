import { expect, expectTypeOf, test } from "vitest";
import { isPendingInteraction, type PendingInteraction } from "../index";

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

test("isPendingInteraction validates approval steps", () => {
  // A full approval step (with display params) is accepted.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
          params: { to: "alex@acme.com", subject: "Q3 report" },
          paramsHash: "h7f3a1",
        },
      ],
    }),
  ).toBe(true);

  // `params` is optional: an approval step without it is accepted.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
          paramsHash: "h7f3a1",
        },
      ],
    }),
  ).toBe(true);

  // A missing paramsHash is invalid.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
        },
      ],
    }),
  ).toBe(false);

  // A missing toolkit / action is invalid.
  expect(
    isPendingInteraction({
      steps: [{ kind: "approval", id: "a1", action: "X", paramsHash: "h" }],
    }),
  ).toBe(false);
  expect(
    isPendingInteraction({
      steps: [
        { kind: "approval", id: "a1", toolkit: "gmail", paramsHash: "h" },
      ],
    }),
  ).toBe(false);

  // A non-string param value is invalid.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
          params: { to: 42 },
          paramsHash: "h",
        },
      ],
    }),
  ).toBe(false);

  // `paramsOmitted` is optional: a numeric value is accepted.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
          paramsHash: "h",
          paramsOmitted: 3,
        },
      ],
    }),
  ).toBe(true);

  // A non-number `paramsOmitted` is invalid.
  expect(
    isPendingInteraction({
      steps: [
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
          paramsHash: "h",
          paramsOmitted: "3",
        },
      ],
    }),
  ).toBe(false);

  // A whole interaction mixing kinds — questions → signin → connect → approval —
  // is accepted (approvals land last).
  expect(
    isPendingInteraction({
      steps: [
        { kind: "question", id: "q1", question: "Which draft?" },
        { kind: "signin", id: "s1" },
        { kind: "connect", id: "c1", toolkit: "gmail" },
        {
          kind: "approval",
          id: "a1",
          toolkit: "gmail",
          action: "GMAIL_SEND_DRAFT",
          paramsHash: "h7f3a1",
        },
      ],
    }),
  ).toBe(true);
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
      {
        kind: "approval",
        id: "a1",
        toolkit: "gmail",
        action: "GMAIL_SEND_DRAFT",
        params: { to: "alex@acme.com" },
        paramsHash: "h7f3a1",
      },
    ],
  };

  expectTypeOf(pending).toMatchTypeOf<PendingInteraction>();
  // @ts-expect-error — a step's `kind` is the discriminant; other values are not assignable
  const bad: PendingInteraction = { steps: [{ kind: "unknown" }] };
  void bad;
});
