import { expect, expectTypeOf, test } from "vitest";
import { isPendingInteraction, type PendingInteraction } from "../index";

test("isPendingInteraction accepts the step-sequence shape and rejects legacy shapes", () => {
  expect(
    isPendingInteraction({
      steps: [
        { kind: "question", id: "q1", question: "Which deck?" },
        { kind: "signin", id: "s1", reason: "Sign in to use your apps." },
        { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send it" },
        {
          kind: "custom_integration",
          id: "x1",
          proposal: {
            name: "Acme CRM",
            baseUrl: "https://api.acme.example",
            auth: { type: "header", header: "Authorization" },
            description: "Acme CRM records",
          },
        },
        {
          kind: "mcp_server",
          id: "m1",
          proposal: {
            name: "Acme Tracker",
            url: "https://mcp.acme.example",
            auth: { type: "bearer" },
          },
        },
      ],
    }),
  ).toBe(true);

  // A proposal step missing its proposal fields is invalid.
  expect(
    isPendingInteraction({
      steps: [{ kind: "custom_integration", id: "x1", proposal: {} }],
    }),
  ).toBe(false);
  expect(
    isPendingInteraction({
      steps: [{ kind: "mcp_server", id: "m1", proposal: { name: "x" } }],
    }),
  ).toBe(false);

  // A signin step needs only kind + id; reason is optional.
  expect(isPendingInteraction({ steps: [{ kind: "signin", id: "s1" }] })).toBe(
    true,
  );

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
        kind: "custom_integration",
        id: "x1",
        proposal: {
          name: "Acme CRM",
          baseUrl: "https://api.acme.example",
          auth: { type: "header", header: "Authorization", prefix: "Bearer " },
          description: "Acme CRM records",
        },
        reason: "to read your CRM contacts",
      },
      {
        kind: "mcp_server",
        id: "m1",
        proposal: {
          name: "Acme Tracker",
          url: "https://mcp.acme.example",
          auth: { type: "bearer" },
          description: "Acme issue tracker",
        },
        reason: "to read your open issues",
      },
    ],
  };

  expectTypeOf(pending).toMatchTypeOf<PendingInteraction>();
  // @ts-expect-error — a step's `kind` is the discriminant; other values are not assignable
  const bad: PendingInteraction = { steps: [{ kind: "unknown" }] };
  void bad;
});
