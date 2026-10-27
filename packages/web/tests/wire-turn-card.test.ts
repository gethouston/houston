import { HoustonClient } from "@houston/engine-adapter/client";
import type { PendingInteraction } from "@houston/wire-types";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * One turn's board-card writes on the wire. The turn finds its card ONCE (the
 * start write's list read) and PATCHes that id from then on: the early
 * hand-back on `reply_complete` and the settle on `done` carry no list read in
 * front of them, and land in order — the early `needs_you` never overtaken by
 * the start's `running`, the settle last with the offers it ended on.
 */

const BASE = "http://host";
const AGENT = "a1";
const SK = "activity-m1";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const offers = {
  steps: [
    {
      kind: "suggest_actions",
      id: "s1",
      actions: [{ id: "a", label: "Another", message: "Do another" }],
    },
  ],
} as unknown as PendingInteraction;

const chunk = (frames: object[]) =>
  new TextEncoder().encode(
    frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join(""),
  );

/** An SSE body that pauses between its parts, as a live turn's stream does:
 *  the wrap-up after `reply_complete` takes seconds, not one chunk. */
const sse = (...parts: object[][]) =>
  new Response(
    new ReadableStream({
      async start(controller) {
        for (const [i, part] of parts.entries()) {
          if (i > 0) await new Promise((r) => setTimeout(r, 100));
          controller.enqueue(chunk(part));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );

const turn = (type: string, rest: object = {}) => ({
  type,
  turnId: "t1",
  ...rest,
});

test("a turn PATCHes its card in order, reading the board only once", async () => {
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events"))
      return sse(
        [{ type: "sync", data: { running: false, partial: "", seq: 0 } }],
        [
          turn("text", { data: "Here it is.", seq: 1 }),
          turn("reply_complete", { data: null, seq: 2 }),
        ],
        [
          turn("tool_start", {
            data: { name: "mcp__houston__suggest_actions", args: {} },
            seq: 3,
          }),
          turn("done", { data: null, pendingInteraction: offers, seq: 4 }),
        ],
      );
    if (call.url.endsWith("/messages")) return json(202, { turnId: "t1" });
    if (call.method === "GET" && call.url.endsWith("/activities"))
      return json(200, {
        items: [{ id: "m1", title: "x", status: "needs_you", session_key: SK }],
      });
    if (call.method === "PATCH") return json(200, { id: "m1", status: "x" });
    return json(200, { ok: true, messages: [] });
  });
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);

  await c.startSession(AGENT, { sessionKey: SK, prompt: "hi" });
  const board = () => calls.filter((call) => call.url.includes("/activities"));
  await vi.waitUntil(
    () => board().filter((call) => call.method === "PATCH").length === 3,
    { timeout: 5_000 },
  );

  expect(board().map((call) => `${call.method} ${call.url}`)).toEqual([
    `GET ${BASE}/agents/${AGENT}/activities`,
    `PATCH ${BASE}/agents/${AGENT}/activities/m1?stamp=last_message`,
    `PATCH ${BASE}/agents/${AGENT}/activities/m1?stamp=last_message`,
    `PATCH ${BASE}/agents/${AGENT}/activities/m1?stamp=last_message`,
  ]);
  expect(board().map((call) => call.body)).toEqual([
    null,
    JSON.stringify({ status: "running", pending_interaction: null }),
    JSON.stringify({ status: "needs_you", pending_interaction: null }),
    JSON.stringify({ status: "needs_you", pending_interaction: offers }),
  ]);
  for (const call of board()) expectGatewayHeaders(call);
});
