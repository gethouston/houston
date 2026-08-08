import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../acting-context";
import { runWithConversationId } from "../conversation-context";
import {
  makeSaveRoutineTool,
  ROUTINE_RUN_SAVE_REFUSAL,
  SAVE_ROUTINE_TOOL_NAME,
} from "./save-routine";

/**
 * save_routine is a thin proxy to the host's merge-safe /sandbox/routines/save
 * route under the per-sandbox token. These pin: the URL + Authorization header,
 * the params passed through as the body, the acting-as forwarding, and that a
 * host rejection surfaces as a tool error the agent can relay (never a silent
 * success — the whole point is replacing the wholesale file write).
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

const tool = makeSaveRoutineTool({
  baseUrl: "https://host.test/",
  sandboxToken: "sb-tok",
});
const ctx = {} as unknown as ExtensionContext;
const run = (params: unknown) =>
  tool.execute("id", params as never, undefined, undefined, ctx);

test("is named save_routine", () => {
  expect(tool.name).toBe(SAVE_ROUTINE_TOOL_NAME);
});

test("POSTs the params to the merge-safe route with the sandbox token", async () => {
  const calls = mockFetch(() => ({ body: { id: "r1", name: "Daily" } }));
  const out = await run({
    name: "Daily",
    prompt: "summarize",
    schedule: "0 9 * * *",
    setup_activity_id: "act-9",
  });
  expect(calls[0]?.url).toBe("https://host.test/sandbox/routines/save");
  expect(calls[0]?.auth).toBe("Bearer sb-tok");
  expect(calls[0]?.body).toEqual({
    name: "Daily",
    prompt: "summarize",
    schedule: "0 9 * * *",
    setup_activity_id: "act-9",
  });
  const text = (out.content[0] as { text: string }).text;
  expect(text).toContain("Daily");
  expect((out.details as { id: string }).id).toBe("r1");
});

test("forwards the acting-as identity so the routine records its creator", async () => {
  const calls = await runWithActingContext({ actingAs: "tok-abc" }, () => {
    const c = mockFetch(() => ({ body: { id: "r1", name: "Daily" } }));
    return run({ name: "Daily", prompt: "p", schedule: "0 9 * * *" }).then(
      () => c,
    );
  });
  expect(calls[0]?.headers["x-houston-acting-as"]).toBe("tok-abc");
});

test("surfaces a host rejection as a tool error (never a silent success)", async () => {
  mockFetch(() => ({
    status: 400,
    body: {
      error:
        "Event triggers are not available here. Give this automation a schedule instead.",
    },
  }));
  await expect(
    run({
      name: "watch",
      prompt: "p",
      trigger: { toolkit: "gmail", trigger_slug: "X", trigger_config: {} },
    }),
  ).rejects.toThrow(/Event triggers are not available here/);
});

/**
 * A firing routine must never author routines (PRODUCT-1208): a prompt phrased
 * as a scheduling request ("Every hour, post two quotes…") pushed the agent
 * into creating a COPY of the routine that was running, and the run's actual
 * work never happened. Run conversations are `routine-<id>`; setup chats are
 * `activity-<id>` and keep full authoring rights.
 */
test("refuses inside a firing routine's own run, without reaching the host", async () => {
  const calls = mockFetch(() => ({ body: { id: "r2", name: "Copy" } }));
  await expect(
    runWithConversationId("routine-68f130a9", () =>
      run({
        name: "Hourly Inspiration",
        prompt: "Every hour, post two quotes.",
        schedule: "0 * * * *",
      }),
    ),
  ).rejects.toThrow(ROUTINE_RUN_SAVE_REFUSAL);
  expect(calls).toHaveLength(0);
});

test("still saves from a routine's setup chat (authoring is untouched)", async () => {
  const calls = mockFetch(() => ({ body: { id: "r1", name: "Daily" } }));
  await runWithConversationId("activity-64277b28", () =>
    run({ name: "Daily", prompt: "p", schedule: "0 9 * * *" }),
  );
  expect(calls).toHaveLength(1);
});
