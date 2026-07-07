import { expectTypeOf, test } from "vitest";
import type { PendingInteraction } from "../index";

test("the protocol index re-exports PendingInteraction", () => {
  const question: PendingInteraction = {
    kind: "question",
    question: "Which slide deck?",
    options: [{ id: "q2", label: "Q2 review" }],
  };
  const connect: PendingInteraction = { kind: "connect", toolkit: "gmail" };
  const custom: PendingInteraction = {
    kind: "custom_integration",
    proposal: {
      name: "Acme CRM",
      baseUrl: "https://api.acme.example",
      auth: { type: "header", header: "Authorization", prefix: "Bearer " },
      description: "Acme CRM records",
    },
    reason: "to read your CRM contacts",
  };

  const mcp: PendingInteraction = {
    kind: "mcp_server",
    proposal: {
      name: "Acme Tracker",
      url: "https://mcp.acme.example",
      auth: { type: "bearer" },
      description: "Acme issue tracker",
    },
    reason: "to read your open issues",
  };

  expectTypeOf(question).toMatchTypeOf<PendingInteraction>();
  expectTypeOf(connect).toMatchTypeOf<PendingInteraction>();
  expectTypeOf(custom).toMatchTypeOf<PendingInteraction>();
  expectTypeOf(mcp).toMatchTypeOf<PendingInteraction>();
  // @ts-expect-error — `kind` is the discriminant; other values are not assignable
  const bad: PendingInteraction = { kind: "unknown" };
  void bad;
});
