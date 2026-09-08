import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CONFIRMATION_TTL_MS, resolveConfirmationReply } from "../confirm-gate";
import { runWithConversationId } from "../conversation-context";
import {
  type InteractionHolder,
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { makeAssistantCallTool } from "./assistant-call";
import { httpSandboxFetch } from "./sandbox-fetch";

/**
 * The confirmation gate — the ONE thing standing between a model that decided
 * to delete something and the delete actually happening.
 *
 * The incident these pin (Sep 2026): asked to "make Dobby blue", the model
 * called `houston_call({operation:"deleteAgent", confirmed:true})` and Houston
 * deleted the agent. `confirmed` was a tool PARAM the model set itself, so the
 * gate was a sentence in a prompt, not a gate. It is gone: approval now exists
 * only as a runtime record minted from the USER's answer to a real card, keyed
 * to one exact (operation, params) pair, single-use, and short-lived.
 */

const CTX = {} as ExtensionContext;

const catalog: AssistantCatalog = {
  version: 3,
  sourceHash: "fixture",
  operations: [
    {
      name: "listAgents",
      group: "agents",
      description: "List the agents.",
      confirm: false,
      hidden: false,
      params: [],
      returns: { type: "array" },
      route: {
        method: "GET",
        path: "/v1/agents",
        pathParams: [],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "deleteAgent",
      group: "agents",
      description: "Delete an agent and everything in it.",
      confirm: true,
      hidden: false,
      params: [{ name: "id", required: true, schema: { type: "string" } }],
      returns: { type: "null" },
      route: {
        method: "DELETE",
        path: "/v1/agents/{id}",
        pathParams: [{ name: "id", encoding: "segment" }],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
  ],
} as AssistantCatalog;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  vi.useRealTimers();
});
beforeEach(() => {
  // A distinct conversation per test would do, but pinning the clock is what
  // makes the TTL assertions honest, and fake timers reset the shared store's
  // relevance by moving every prior grant past its expiry.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T10:00:00Z"));
});

/** Every host call this runtime makes, so "never forwarded" is provable. */
function mockFetch(body: unknown = null) {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const tool = makeAssistantCallTool({
  catalog,
  call: httpSandboxFetch("http://host/", "sb-token"),
});

interface CallResult {
  content: { type: string; text?: string }[];
  details: unknown;
}

/** One `houston_call`, inside a turn of `conversationId`. */
async function call(
  conversationId: string,
  params: Record<string, unknown>,
): Promise<{ result: CallResult; holder: InteractionHolder }> {
  const holder = newInteractionHolder();
  const result = (await runWithConversationId(conversationId, () =>
    runWithInteractionCapture(holder, () =>
      tool.execute("call-1", params as never, undefined, undefined, CTX),
    ),
  )) as CallResult;
  return { result, holder };
}

const text = (r: CallResult) => r.content.map((c) => c.text ?? "").join("");
const code = (r: CallResult) =>
  (r.details as { error?: { code?: string } }).error?.code;

/** The one question step the gate raised, as the app would render it. */
function raisedQuestion(holder: InteractionHolder) {
  const step = holder.pending?.steps[0];
  if (step?.kind !== "question")
    throw new Error("no confirmation card was raised");
  return step;
}

/** What the app POSTs back when the user clicks an option on that card. */
function clickOption(
  holder: InteractionHolder,
  optionId: "approve" | "decline",
): string {
  const step = raisedQuestion(holder);
  const option = step.options?.find((o) => o.id === optionId);
  if (!option) throw new Error(`no ${optionId} option on the card`);
  return `${step.question}: ${option.label}`;
}

test("the incident: a delete the model 'confirmed' itself never leaves the runtime", async () => {
  const calls = mockFetch();
  const { result, holder } = await call("conv-1", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
    // What the model actually sent on the day. There is no such input any more,
    // and an ignored extra key must not read as approval.
    confirmed: true,
  });

  expect(calls).toEqual([]);
  expect(code(result)).toBe("needs_confirmation");
  expect(text(result)).toContain("ERROR needs_confirmation");
  expect(result.details).toMatchObject({
    ok: false,
    operation: "deleteAgent",
    confirmation: { params: { id: "Personal/Dobby" } },
  });
  // A real card, in the user's hands — not a sentence in the model's context.
  const step = raisedQuestion(holder);
  expect(step.question).toContain("Delete an agent and everything in it");
  expect(step.question).toContain("Personal/Dobby");
  expect(step.options?.map((o) => o.id)).toEqual(["approve", "decline"]);
});

test("the model cannot mint approval: `confirmed` is not an input it can set", () => {
  const schema = tool.parameters as { properties?: Record<string, unknown> };
  expect(Object.keys(schema.properties ?? {})).toEqual(["operation", "params"]);
});

test("the tool result orders the model to end its turn and never work around the gate", async () => {
  mockFetch();
  const { result } = await call("conv-1", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  const message = text(result);
  expect(message).toMatch(/end your turn/i);
  expect(message).toMatch(/do not retry/i);
  // The delete-then-recreate dodge, named so the model cannot invent it.
  expect(message).toMatch(/recreat/i);
});

test("the user's approval on the card lets the SAME call through exactly once", async () => {
  const calls = mockFetch();
  const first = await call("conv-2", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(calls).toEqual([]);

  resolveConfirmationReply("conv-2", clickOption(first.holder, "approve"));

  const second = await call("conv-2", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(second.result.details).toEqual({ ok: true, operation: "deleteAgent" });
  expect(calls).toEqual(["http://host/sandbox/assistant/call"]);

  // Single use: the grant was consumed, so an identical repeat needs a new one.
  const third = await call("conv-2", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(code(third.result)).toBe("needs_confirmation");
  expect(calls).toHaveLength(1);
});

test("an approval is bound to the exact params: a different target is a new ask", async () => {
  const calls = mockFetch();
  const raised = await call("conv-3", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  resolveConfirmationReply("conv-3", clickOption(raised.holder, "approve"));

  const other = await call("conv-3", {
    operation: "deleteAgent",
    params: { id: "Personal/Milo" },
  });
  expect(code(other.result)).toBe("needs_confirmation");
  expect(calls).toEqual([]);
});

test("an approval is scoped to its conversation", async () => {
  const calls = mockFetch();
  const raised = await call("conv-4", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  resolveConfirmationReply("conv-4", clickOption(raised.holder, "approve"));

  const elsewhere = await call("conv-5", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(code(elsewhere.result)).toBe("needs_confirmation");
  expect(calls).toEqual([]);
});

test("an approval expires: past the TTL the call is refused again", async () => {
  const calls = mockFetch();
  const raised = await call("conv-6", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  resolveConfirmationReply("conv-6", clickOption(raised.holder, "approve"));

  vi.advanceTimersByTime(CONFIRMATION_TTL_MS + 1);

  const late = await call("conv-6", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(code(late.result)).toBe("needs_confirmation");
  expect(calls).toEqual([]);
});

test("a denial is reported as declined on the retry, and executes nothing", async () => {
  const calls = mockFetch();
  const raised = await call("conv-7", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  resolveConfirmationReply("conv-7", clickOption(raised.holder, "decline"));

  const retry = await call("conv-7", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(code(retry.result)).toBe("confirmation_declined");
  expect(text(retry.result)).toMatch(/said no|declined/i);
  expect(calls).toEqual([]);
});

test("a reply that answers something else grants nothing", async () => {
  const calls = mockFetch();
  const raised = await call("conv-8", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  resolveConfirmationReply("conv-8", "actually, make Dobby blue");
  expect(raised.result).toBeDefined();

  const retry = await call("conv-8", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(code(retry.result)).toBe("needs_confirmation");
  expect(calls).toEqual([]);
});

test("outside a conversation there is nowhere to record approval, so it refuses", async () => {
  const calls = mockFetch();
  const holder = newInteractionHolder();
  const result = (await runWithInteractionCapture(holder, () =>
    tool.execute(
      "call-1",
      { operation: "deleteAgent", params: { id: "x" } } as never,
      undefined,
      undefined,
      CTX,
    ),
  )) as CallResult;
  expect(code(result)).toBe("needs_confirmation");
  expect(calls).toEqual([]);
});

test("a non-confirm operation is untouched by the gate", async () => {
  const calls = mockFetch([]);
  const { result, holder } = await call("conv-9", {
    operation: "listAgents",
    params: {},
  });
  expect(result.details).toEqual({ ok: true, operation: "listAgents" });
  expect(calls).toHaveLength(1);
  expect(holder.pending).toBeUndefined();
});
