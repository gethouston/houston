import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { CHAT_OPEN_WINDOW } from "../src/engine-adapter/history-window";
import {
  type Call,
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The chat surface on the wire, byte for byte.
 *
 * Chat is the one family the web adapter never reached through `cpFetch`: it
 * drives the agent's own runtime directly, so the SDK flip rebound the CLIENT
 * (`sdk.clientFor`, and `sdk.turns` / `sdk.conversations` for the one-shot
 * commands) rather than the request builder. Nothing else in the suite would
 * notice that rebind putting a turn on a different path, sending a different
 * body, or losing the active-space header that picks which pod answers — the
 * requests below ARE that record.
 *
 * Read the paths against protocol v3: every conversation route is nested under
 * the agent's own sandbox (`/agents/<id>/conversations/<sessionKey>/…`), which
 * the gateway proxies to that agent's pod.
 */

const BASE = "http://host";
const AGENT = "a1";
const SK = "sk-1";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = (org = ORG) => {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(org);
  return c;
};

/**
 * Answer the conversation routes: JSON for the commands, an empty body for the
 * observer/turn event stream (which ends it immediately, so a spec never leaves
 * a stream running into the next one).
 */
function stubEngine(body: Record<string, unknown> = { ok: true }) {
  stubRouted((call: Call) =>
    call.url.endsWith("/events")
      ? new Response("", { status: 200 })
      : json(200, body),
  );
}

const onlyCall = (): Call => {
  expect(calls).toHaveLength(1);
  return calls[0];
};

// ---- the one-shot conversation controls ----

test("cancelSession posts a byte-identical single POST …/conversations/:id/cancel", async () => {
  stubEngine({ ok: true, cancelled: true });

  const result = await client().cancelSession(AGENT, SK);

  const post = onlyCall(); // a live turn settles itself: no rescue write
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/${AGENT}/conversations/${SK}/cancel`);
  expect(post.body).toBeNull();
  expect(post.headers.get("Authorization")).toBe("Bearer t");
  expect(post.headers.get("x-houston-org")).toBe(ORG);
  expect(result).toEqual({ cancelled: true });
});

test("setLiveTurnMode posts the mode pill's pick and nothing else", async () => {
  stubEngine({ ok: true, applied: true });

  const result = await client().setLiveTurnMode(AGENT, SK, "plan");

  const post = onlyCall();
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/${AGENT}/conversations/${SK}/mode`);
  expect(post.body).toBe(JSON.stringify({ mode: "plan" }));
  expectGatewayHeaders(post);
  expect(result).toEqual({ ok: true, applied: true });
});

test("dismissInteraction posts the stop marker with no body", async () => {
  stubEngine();

  await client().dismissInteraction(AGENT, SK);

  const post = onlyCall();
  expect(post.method).toBe("POST");
  expect(post.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/dismiss-interaction`,
  );
  expect(post.body).toBeNull();
  expect(post.headers.get("x-houston-org")).toBe(ORG);
});

test("truncateConversation posts the turn it cuts at", async () => {
  stubEngine({ ok: true, removed: 2 });

  await client().truncateConversation(AGENT, SK, "turn-9");

  const post = onlyCall();
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/${AGENT}/conversations/${SK}/truncate`);
  expect(post.body).toBe(JSON.stringify({ turnId: "turn-9" }));
  expectGatewayHeaders(post);
});

test("summarizeActivity titles the excerpt on the agent's own runtime", async () => {
  stubEngine({ title: "Trip to Lisbon" });

  const titled = await client().summarizeActivity("plan a trip to Lisbon", {
    agentPath: AGENT,
  });

  const post = onlyCall();
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/${AGENT}/title`);
  expect(post.body).toBe(JSON.stringify({ text: "plan a trip to Lisbon" }));
  expectGatewayHeaders(post);
  expect(titled).toEqual({ title: "Trip to Lisbon", description: "" });
});

test("a title the engine cannot produce falls back to truncation, never blocking the send", async () => {
  stubRouted(() => json(503, { error: "engine waking" }));

  const titled = await client().summarizeActivity("plan a trip", {
    agentPath: AGENT,
  });

  expect(titled).toEqual({ title: "plan a trip", description: "" });
});

// ---- the reads and the send ----

test("loadChatHistory reads the tail window, then attaches the observer stream", async () => {
  stubEngine({ id: SK, title: "t", messages: [] });

  await client().loadChatHistory(AGENT, SK);

  const [read] = calls;
  expect(read.method).toBe("GET");
  expect(read.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/messages?limit=${CHAT_OPEN_WINDOW}`,
  );
  expect(read.headers.get("Authorization")).toBe("Bearer t");
  expect(read.headers.get("x-houston-org")).toBe(ORG);
  // The observer attaches ONCE — a second subscription would double every frame.
  const streams = calls.filter((c) => c.url.endsWith("/events"));
  expect(streams).toHaveLength(1);
  expect(streams[0].url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/events`,
  );
});

test("a chat-open read still rides the transient-retry ladder a pod handoff needs", async () => {
  // The SDK's client is built over the SAME read retry every control-plane call
  // gets (`createEngineSdk` composes `transientRetryFetch`). Without it, a
  // history read that lands mid rolling-deploy throws once and the chat renders
  // empty until the user reselects it (HOU-731) — invisible in every other spec.
  vi.useFakeTimers();
  let messageReads = 0;
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events")) return new Response("", { status: 200 });
    messageReads++;
    return messageReads === 1
      ? json(503, { error: "pod handoff" })
      : json(200, { id: SK, title: "t", messages: [] });
  });

  const pending = client().loadChatHistory(AGENT, SK);
  await vi.advanceTimersByTimeAsync(500);
  await expect(pending).resolves.toEqual([]);
  expect(messageReads).toBe(2);
  vi.useRealTimers();
});

test("startSession posts the turn to the agent's own sandbox, carrying its per-turn pin", async () => {
  stubEngine({ ok: true });

  await client().startSession(AGENT, {
    sessionKey: SK,
    prompt: "hello",
    provider: "openai",
    model: "gpt-6-astra",
  });

  const send = await vi.waitUntil(() =>
    calls.find((c) => c.method === "POST" && c.url.endsWith("/messages")),
  );
  expect(send.url).toBe(`${BASE}/agents/${AGENT}/conversations/${SK}/messages`);
  expectGatewayHeaders(send);
  // The nonce is minted per turn; everything else is the caller's own send.
  const body = JSON.parse(send.body ?? "{}") as Record<string, unknown>;
  expect(typeof body.nonce).toBe("string");
  expect({ ...body, nonce: undefined }).toEqual({
    text: "hello",
    nonce: undefined,
    provider: "openai-codex",
    model: "gpt-6-astra",
    effort: undefined,
    mode: undefined,
    displayText: undefined,
    mentions: undefined,
    approvals: undefined,
  });
});

// ---- the ids the paths splice ----

test("every conversation path percent-encodes the agent and the session key", async () => {
  stubEngine({ ok: true, cancelled: true });
  const c = client();

  await c.cancelSession("Home/Ada", "activity-a/1");
  await c.setLiveTurnMode("Home/Ada", "activity-a/1", "auto");
  await c.truncateConversation("Home/Ada", "activity-a/1", "t-1");

  expect(calls.map((call) => call.url)).toEqual([
    `${BASE}/agents/Home%2FAda/conversations/activity-a%2F1/cancel`,
    `${BASE}/agents/Home%2FAda/conversations/activity-a%2F1/mode`,
    `${BASE}/agents/Home%2FAda/conversations/activity-a%2F1/truncate`,
  ]);
});

test("a failed control surfaces the engine's status — never swallowed", async () => {
  stubRouted(() => json(409, { error: "a turn raced the edit" }));
  await expect(
    client().truncateConversation(AGENT, SK, "turn-9"),
  ).rejects.toMatchObject({ status: 409 });
});
