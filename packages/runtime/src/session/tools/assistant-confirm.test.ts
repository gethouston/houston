import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { afterEach, expect, test } from "vitest";
import { runWithConversationId } from "../conversation-context";
import {
  type InteractionHolder,
  newInteractionHolder,
  runWithInteractionCapture,
} from "../interaction";
import { runWithTurnMode } from "../turn-mode-context";
import { makeAssistantCallTool } from "./assistant-call";
import { httpSandboxFetch } from "./sandbox-fetch";

/**
 * The confirmation gate as the RUNTIME sees it — the ONE thing standing between
 * a model that decided to delete something and the delete happening.
 *
 * The incident these pin (Sep 2026): asked to "make Dobby blue", the model
 * called `houston_call({operation:"deleteAgent", confirmed:true})` and Houston
 * deleted the agent. `confirmed` was a tool PARAM the model set itself, so the
 * gate was a sentence in a prompt, not a gate.
 *
 * What replaced it: the runtime holds no approval at all. It asks the HOST to
 * raise a card (`POST /sandbox/assistant/pending`), shows exactly the wording
 * the host authored, and repeats the host's `requestId` on the next call. The
 * host matches that id against the receipt the USER's own reply minted, so a
 * runtime that lied about every step of this still performs nothing.
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
});

interface HostCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | undefined;
}

/**
 * A host that answers `/pending` with a fresh request id and `/call` with
 * whatever `callReply` says. Every request is recorded, so "never forwarded"
 * and "carried the id back" are both provable.
 */
function mockHost(
  callReply: () => { status?: number; body?: unknown } = () => ({ body: null }),
) {
  const calls: HostCall[] = [];
  let issued = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined,
    });
    if (url.endsWith("/sandbox/assistant/pending")) {
      issued += 1;
      return Response.json({
        requestId: `req-${issued}`,
        summary:
          'Delete an agent and everything in it. This affects id "Personal/Dobby".',
      });
    }
    const reply = callReply();
    return new Response(
      reply.body === undefined ? null : JSON.stringify(reply.body),
      { status: reply.status ?? 200 },
    );
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
  conversationId: string | undefined,
  params: Record<string, unknown>,
  mode?: "execute" | "plan" | "auto",
): Promise<{ result: CallResult; holder: InteractionHolder }> {
  const holder = newInteractionHolder();
  const run = () =>
    runWithConversationId(conversationId, () =>
      runWithInteractionCapture(holder, () =>
        tool.execute("call-1", params as never, undefined, undefined, CTX),
      ),
    );
  const result = (await (mode
    ? runWithTurnMode({ current: mode }, run)
    : run())) as CallResult;
  return { result, holder };
}

const text = (r: CallResult) => r.content.map((c) => c.text ?? "").join("");
const code = (r: CallResult) =>
  (r.details as { error?: { code?: string } }).error?.code;
const paths = (calls: HostCall[]) =>
  calls.map((c) => c.url.replace("http://host", ""));

/** The one question step the gate raised, as the app would render it. */
function raisedQuestion(holder: InteractionHolder) {
  const step = holder.pending?.steps[0];
  if (step?.kind !== "question")
    throw new Error("no confirmation card was raised");
  return step;
}

test("the incident: a delete the model 'confirmed' itself is never performed", async () => {
  const calls = mockHost();
  const { result, holder } = await call("conv-1", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
    // What the model actually sent on the day. There is no such input any more,
    // and an ignored extra key must not read as approval.
    confirmed: true,
  });

  // It asked for a card. It did NOT perform anything.
  expect(paths(calls)).toEqual(["/sandbox/assistant/pending"]);
  expect(code(result)).toBe("needs_confirmation");
  expect(text(result)).toContain("ERROR needs_confirmation");
  expect(result.details).toMatchObject({
    ok: false,
    operation: "deleteAgent",
    confirmation: { params: { id: "Personal/Dobby" }, requestId: "req-1" },
  });
  const step = raisedQuestion(holder);
  expect(step.question).toContain("Delete an agent and everything in it");
  expect(step.question).toContain("Personal/Dobby");
  expect(step.requestId).toBe("req-1");
  expect(step.options?.map((o) => o.id)).toEqual(["approve", "decline"]);
});

test("`confirmed` is not an input the model can set; `requestId` is the only extra", () => {
  const schema = tool.parameters as { properties?: Record<string, unknown> };
  expect(Object.keys(schema.properties ?? {})).toEqual([
    "operation",
    "params",
    "requestId",
  ]);
});

test("the tool result orders the model to end its turn and never work around the gate", async () => {
  mockHost();
  const { result } = await call("conv-1", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  const message = text(result);
  expect(message).toMatch(/end your turn/i);
  expect(message).toMatch(/do not retry/i);
  // The delete-then-recreate dodge, named so the model cannot invent it.
  expect(message).toMatch(/recreat/i);
  expect(message).toContain("req-1");
});

test("the pending ask names its conversation, so no other chat can answer it", async () => {
  const calls = mockHost();
  await call("conv-2", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(calls[0]?.headers["x-houston-conversation-id"]).toBe("conv-2");
  expect(calls[0]?.body).toEqual({
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
});

test("with a requestId the call goes through, carrying the id for the host to check", async () => {
  const calls = mockHost(() => ({ body: null }));
  const { result } = await call("conv-3", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
    requestId: "req-1",
  });
  expect(result.details).toEqual({ ok: true, operation: "deleteAgent" });
  expect(paths(calls)).toEqual(["/sandbox/assistant/call"]);
  expect(calls[0]?.body).toEqual({
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
    requestId: "req-1",
  });
  expect(calls[0]?.headers["x-houston-conversation-id"]).toBe("conv-3");
});

test("a requestId the host will not honour asks again instead of dead-ending", async () => {
  const calls = mockHost(() => ({
    status: 403,
    body: { error: "not approved", code: "approval_required" },
  }));
  const { result, holder } = await call("conv-4", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
    requestId: "stale-or-invented",
  });
  expect(code(result)).toBe("needs_confirmation");
  expect(paths(calls)).toEqual([
    "/sandbox/assistant/call",
    "/sandbox/assistant/pending",
  ]);
  expect(raisedQuestion(holder).requestId).toBe("req-1");
});

test("the host's denial is reported as declined, and nothing is retried", async () => {
  mockHost(() => ({
    status: 403,
    body: { error: "the user said no", code: "approval_denied" },
  }));
  const { result, holder } = await call("conv-5", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
    requestId: "req-1",
  });
  expect(code(result)).toBe("confirmation_declined");
  expect(text(result)).toMatch(/said no/i);
  expect(holder.pending).toBeUndefined();
});

test("outside a conversation there is nowhere to ask, so it refuses and asks nothing", async () => {
  const calls = mockHost();
  const { result } = await call(undefined, {
    operation: "deleteAgent",
    params: { id: "x" },
  });
  expect(code(result)).toBe("needs_confirmation");
  expect(calls).toEqual([]);
});

test("a host that cannot raise the card performs nothing and says so", async () => {
  globalThis.fetch = (async () =>
    new Response("nope", { status: 500 })) as typeof fetch;
  const { result, holder } = await call("conv-6", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  expect(code(result)).toBe("gateway_error");
  expect(holder.pending).toBeUndefined();
});

test("a non-confirm operation is untouched by the gate", async () => {
  const calls = mockHost(() => ({ body: [] }));
  const { result, holder } = await call("conv-7", {
    operation: "listAgents",
    params: {},
  });
  expect(result.details).toEqual({ ok: true, operation: "listAgents" });
  expect(paths(calls)).toEqual(["/sandbox/assistant/call"]);
  expect(holder.pending).toBeUndefined();
});

/**
 * A6: the Mode pill can move to Plan WHILE the turn runs. The session's toolset
 * is already built, so the live mode is what has to stop the next mutation.
 */
test("switching to Plan mode mid-turn stops the next mutation, reads still run", async () => {
  const calls = mockHost(() => ({ body: [] }));
  const blocked = await call(
    "conv-8",
    { operation: "deleteAgent", params: { id: "Personal/Dobby" } },
    "plan",
  );
  expect(code(blocked.result)).toBe("operation_not_supported");
  expect(text(blocked.result)).toMatch(/plan mode/i);
  expect(calls).toEqual([]);

  const read = await call(
    "conv-8",
    { operation: "listAgents", params: {} },
    "plan",
  );
  expect(read.result.details).toEqual({ ok: true, operation: "listAgents" });
  expect(paths(calls)).toEqual(["/sandbox/assistant/call"]);
});

test("approval controls are structural and the summary has no closing question", async () => {
  mockHost();
  const { holder } = await call("conv-controls", {
    operation: "deleteAgent",
    params: { id: "Personal/Dobby" },
  });
  const step = raisedQuestion(holder);
  expect(step.options).toEqual([
    { kind: "approval", id: "approve" },
    { kind: "approval", id: "decline" },
  ]);
  expect(step.question).toBe(
    'Delete an agent and everything in it. This affects id "Personal/Dobby".',
  );
});
