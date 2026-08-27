import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../acting-context";
import { runWithConversationId } from "../conversation-context";
import { httpSandboxFetch } from "./sandbox-fetch";
import {
  CONVERSATION_ID_HEADER,
  makeSaveLearningTool,
  SAVE_LEARNING_TOOL_NAME,
} from "./save-learning";

/**
 * save_learning is a thin proxy to the host's merge-safe + provenance-stamping
 * /sandbox/learnings/save route under the per-sandbox token. These pin: the URL
 * + Authorization header, that ONLY the text crosses the wire (provenance is
 * derived server-side, never claimed by the model), the acting-as + conversation
 * forwarding that makes that derivation possible, and that a host rejection
 * surfaces as a tool error the agent can relay.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Captured {
  url: string;
  auth?: string;
  headers: Record<string, string>;
  body: unknown;
}
function mockFetch(reply: () => { status?: number; body?: unknown }) {
  const calls: Captured[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(input),
      auth: headers.authorization,
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const r = reply();
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

const tool = makeSaveLearningTool({
  call: httpSandboxFetch("https://host.test/", "sb-tok"),
});
const ctx = {} as unknown as ExtensionContext;
const run = (params: unknown) =>
  tool.execute("id", params as never, undefined, undefined, ctx);

const OK = () => ({ status: 201, body: { id: "l1" } });

test("is named save_learning", () => {
  expect(tool.name).toBe(SAVE_LEARNING_TOOL_NAME);
});

test("POSTs only the text to the merge-safe route with the sandbox token", async () => {
  const calls = mockFetch(OK);
  const out = await run({ text: "Exclude churned accounts" });
  expect(calls[0]?.url).toBe("https://host.test/sandbox/learnings/save");
  expect(calls[0]?.auth).toBe("Bearer sb-tok");
  // Provenance is NOT a parameter: the model cannot claim who taught it.
  expect(calls[0]?.body).toEqual({ text: "Exclude churned accounts" });
  expect((out.details as { id: string }).id).toBe("l1");
});

test("outside a turn it forwards no identity or conversation headers", async () => {
  const calls = mockFetch(OK);
  await run({ text: "solo" });
  expect(calls[0]?.headers["x-houston-acting-as"]).toBeUndefined();
  expect(calls[0]?.headers[CONVERSATION_ID_HEADER]).toBeUndefined();
});

test("forwards the acting identity and the turn's conversation id", async () => {
  const calls = await runWithActingContext({ actingAs: "tok-abc" }, () =>
    runWithConversationId("conv-42", () => {
      const c = mockFetch(OK);
      return run({ text: "Invoices go out on the 1st" }).then(() => c);
    }),
  );
  expect(calls[0]?.headers["x-houston-acting-as"]).toBe("tok-abc");
  expect(calls[0]?.headers[CONVERSATION_ID_HEADER]).toBe("conv-42");
});

test("surfaces a host rejection as a tool error (never a silent success)", async () => {
  mockFetch(() => ({ status: 400, body: { error: "missing 'text'" } }));
  await expect(run({ text: "" })).rejects.toThrow(/missing 'text'/);
});
