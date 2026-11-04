import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { planFloorRefusal } from "@houston/host/src/routes/routine-write-gates";
import { afterEach, expect, test } from "vitest";
import { runWithActingContext } from "../acting-context";
import { runWithConversationId } from "../conversation-context";
import { httpSandboxFetch } from "./sandbox-fetch";
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
  call: httpSandboxFetch("https://host.test/", "sb-tok"),
});
const ctx = {} as unknown as ExtensionToolContext;
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

test("relays the mission-depth refusal as actionable text", async () => {
  const error =
    "A mission another AI Employee gave you can't set up routines. Finish the mission, or ask the user to set this up from a chat.";
  mockFetch(() => ({ status: 409, body: { code: "mission_depth", error } }));
  await expect(
    run({ name: "Daily", prompt: "p", schedule: "0 9 * * *" }),
  ).rejects.toThrow(error);
});

test("relays the plan-floor refusal whole, so the agent can offer a slower cadence", async () => {
  // The host's own body, exactly as it answers: the relay keeps 300 chars.
  const body = planFloorRefusal("*/5 * * * *", 1440);
  if (!body) throw new Error("expected a refusal");
  mockFetch(() => ({ status: 400, body }));
  await expect(
    run({ name: "Inbox", prompt: "p", schedule: "*/5 * * * *" }),
  ).rejects.toThrow(body.error);
});

test("tells the agent a save can be refused under the person's plan", () => {
  expect(tool.description).toContain(
    "A save can be refused because it runs more often than this person's plan allows",
  );
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

test("the turn's conversation rides the save, exactly as it rides a mission", () => {
  // `created_by` must come from the identity the HOST recorded for the live
  // turn, not from a header this runtime asserts about itself. The conversation
  // id is the key it looks that turn up by.
  const calls = mockFetch(() => ({ body: { id: "r-1", name: "Digest" } }));
  return runWithConversationId("activity-42", () =>
    runWithActingContext({ actingAs: "u-1", actingUser: "u-1" }, async () => {
      await run({ name: "Digest", prompt: "Send it", schedule: "0 9 * * *" });
      expect(calls[0]?.headers["x-houston-conversation-id"]).toBe(
        "activity-42",
      );
    }),
  );
});

test("outside a turn the header is simply absent", () => {
  const calls = mockFetch(() => ({ body: { id: "r-2", name: "Digest" } }));
  return run({ name: "Digest", prompt: "Send it", schedule: "0 9 * * *" }).then(
    () => {
      expect(calls[0]?.headers).not.toHaveProperty("x-houston-conversation-id");
    },
  );
});

test("tells the agent the saved routine's provider, model and effort", async () => {
  mockFetch(() => ({
    body: {
      id: "r1",
      name: "Daily",
      provider: "openai-codex",
      model: "gpt-6.1-terra",
      effort: "low",
    },
  }));
  const out = await run({ name: "Daily", prompt: "p", schedule: "0 9 * * *" });
  expect(out.content).toEqual([
    expect.objectContaining({ text: expect.stringContaining("GPT-6.1 Terra") }),
  ]);
  expect(out.content[0]).toMatchObject({
    text: expect.stringContaining("only if the user asks or it matters"),
  });
  expect(out.content[0]).toMatchObject({
    text: expect.stringContaining("never the raw model id"),
  });
  expect(out.details).toMatchObject({
    provider: "openai-codex",
    model: "gpt-6.1-terra",
    effort: "low",
  });
});
