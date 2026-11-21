import { bus } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";
import { CHAT_OPEN_WINDOW } from "@houston/engine-adapter/history-window";
import { disposeAllStreams } from "@houston/engine-adapter/turn-stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const BASE = "http://host";
const AGENT = "a1";
const SK = "sk-1";

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  disposeAllStreams();
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

test("cancelSession posts a byte-identical single POST …/conversations/:id/cancel", async () => {
  stubEngine({ ok: true, cancelled: true });

  const result = await client().cancelSession(AGENT, SK);

  const post = onlyCall();
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

test("dismissInteraction answers a running turn's 409 as a typed refusal, not a throw", async () => {
  stubRouted((call: Call) =>
    call.url.endsWith("/dismiss-interaction")
      ? json(409, { error: "turn running" })
      : json(200, { ok: true }),
  );

  await expect(client().dismissInteraction(AGENT, SK)).resolves.toEqual({
    ok: false,
    refusal: "turn_running",
  });
  expect(onlyCall().method).toBe("POST");
});

test("dismissInteraction answers a card meant for another member as a typed refusal", async () => {
  stubRouted((call: Call) =>
    call.url.endsWith("/dismiss-interaction")
      ? json(403, {
          error: "not_interaction_owner",
          code: "not_interaction_owner",
        })
      : json(200, { ok: true }),
  );

  await expect(client().dismissInteraction(AGENT, SK)).resolves.toEqual({
    ok: false,
    refusal: "not_interaction_owner",
  });
  expect(onlyCall().method).toBe("POST");
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
  const streams = calls.filter((c) => c.url.endsWith("/events"));
  expect(streams).toHaveLength(1);
  expect(streams[0].url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/events`,
  );
});

test("loadChatHistory carries a persisted mission receipt into the chat feed", async () => {
  const mission = { id: "m1", title: "Research", agent: "Ada" };
  stubEngine({
    id: SK,
    title: "t",
    messages: [
      {
        role: "assistant",
        content: "Ada is on it",
        ts: 1,
        tools: [
          {
            name: "start_mission",
            input: { agent: "Ada" },
            result: "started",
            isError: false,
            mission,
          },
        ],
      },
    ],
  });

  const feed = await client().loadChatHistory(AGENT, SK);
  const read = calls.find((call) => call.url.includes("/messages?"));
  expect(read?.method).toBe("GET");
  expect(read?.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/messages?limit=${CHAT_OPEN_WINDOW}`,
  );
  expect(read?.headers.get("x-houston-org")).toBe(ORG);
  expect(feed).toContainEqual(
    expect.objectContaining({
      feed_type: "tool_result",
      data: {
        name: "start_mission",
        content: "started",
        is_error: false,
        mission,
      },
    }),
  );
});

test("a chat-open read still rides the transient-retry ladder a pod handoff needs", async () => {
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
    missionTitle: undefined,
  });
});

test("a typed send carries the picker's effort in the body", async () => {
  stubEngine({ ok: true });

  await client().startSession(AGENT, {
    sessionKey: "activity-effort-pin",
    prompt: "think hard",
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "max",
  });

  const send = await vi.waitUntil(() =>
    calls.find((c) => c.method === "POST" && c.url.endsWith("/messages")),
  );
  const body = JSON.parse(send.body ?? "{}") as Record<string, unknown>;
  expect(body).toMatchObject({
    provider: "anthropic",
    model: "claude-opus-5-5",
    effort: "max",
  });
});

test("a new mission's first send asks the runtime to title the card after the reply", async () => {
  stubEngine({ ok: true });

  await client().startSession(AGENT, {
    sessionKey: "activity-new-mission",
    prompt: "Write the weekly sales report",
    provider: "openai",
    model: "gpt-6-astra",
    missionTitle: {
      fallback: "Write the weekly sales report",
      text: "Write the weekly sales report",
    },
  });

  const send = await vi.waitUntil(() =>
    calls.find((c) => c.method === "POST" && c.url.endsWith("/messages")),
  );
  const body = JSON.parse(send.body ?? "{}") as Record<string, unknown>;
  expect(body.missionTitle).toEqual({
    fallback: "Write the weekly sales report",
    text: "Write the weekly sales report",
  });
  expect(calls.some((c) => c.url.endsWith("/title"))).toBe(false);
});

test("a send refused as turn running goes out again byte-identical, never dropped", async () => {
  let posts = 0;
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events")) return new Response("", { status: 200 });
    if (call.method === "POST" && call.url.endsWith("/messages"))
      return ++posts === 1
        ? json(409, { error: "turn running" })
        : json(202, { ok: true });
    return json(200, { ok: true, messages: [] });
  });

  await client().startSession(AGENT, {
    sessionKey: "activity-held",
    prompt: "and one more thing",
  });

  const sends = await vi.waitUntil(
    () => {
      const s = calls.filter(
        (c) => c.method === "POST" && c.url.endsWith("/messages"),
      );
      return s.length === 2 ? s : undefined;
    },
    { timeout: 5_000 },
  );
  expect(sends[1].url).toBe(
    `${BASE}/agents/${AGENT}/conversations/activity-held/messages`,
  );
  expect(sends[1].body).toBe(sends[0].body);
  expectGatewayHeaders(sends[1]);
});

test("a send the shared compute had no room for goes out again byte-identical", async () => {
  let posts = 0;
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events")) return new Response("", { status: 200 });
    if (call.method === "POST" && call.url.endsWith("/messages"))
      return ++posts === 1
        ? json(503, {
            error: "engine unavailable",
            code: "compute_busy",
            detail: "sandbox_queue_timeout",
            retryAfterMs: 1,
          })
        : json(202, { ok: true });
    return json(200, { ok: true, messages: [] });
  });

  await client().startSession(AGENT, {
    sessionKey: "activity-busy",
    prompt: "the weekly numbers, please",
  });

  const sends = await vi.waitUntil(
    () => {
      const s = calls.filter(
        (c) => c.method === "POST" && c.url.endsWith("/messages"),
      );
      return s.length === 2 ? s : undefined;
    },
    { timeout: 5_000 },
  );
  expect(sends[1].url).toBe(
    `${BASE}/agents/${AGENT}/conversations/activity-busy/messages`,
  );
  expect(sends[1].body).toBe(sends[0].body);
  expectGatewayHeaders(sends[1]);
});

const BLOCKED = {
  error:
    "Your GitHub Copilot account is blocked by the provider. Fix it there, or connect another AI.",
  code: "provider_account_blocked",
  provider: "github-copilot",
};

function collectFeed(sessionKey: string): {
  items: Array<Record<string, unknown>>;
  stop: () => void;
} {
  const items: Array<Record<string, unknown>> = [];
  const stop = bus.on((event) => {
    const e = event as {
      type?: string;
      data?: { session_key?: string; item?: Record<string, unknown> };
    };
    if (
      e.type === "FeedItem" &&
      e.data?.session_key === sessionKey &&
      e.data.item
    )
      items.push(e.data.item);
  });
  return { items, stop };
}

test("a send the gateway refused as provider_account_blocked settles as the billing_locked card, not a sign-in", async () => {
  let posts = 0;
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events")) return new Response("", { status: 200 });
    if (call.method === "POST" && call.url.endsWith("/messages")) {
      posts++;
      return json(409, BLOCKED);
    }
    return json(200, { ok: true, messages: [] });
  });
  const feed = collectFeed("activity-blocked");
  try {
    await client().startSession(AGENT, {
      sessionKey: "activity-blocked",
      prompt: "the weekly numbers, please",
      provider: "copilot",
    });
    const card = await vi.waitUntil(
      () => feed.items.find((item) => item.feed_type === "provider_error"),
      { timeout: 5_000 },
    );
    expect(card).toMatchObject({
      feed_type: "provider_error",
      fails_pending: true,
      data: {
        kind: "unauthenticated",
        cause: "billing_locked",
        failed_prompt: "the weekly numbers, please",
        message: BLOCKED.error,
      },
    });
    expect((card.data as { provider: string }).provider).not.toBe("");
    await new Promise((r) => setTimeout(r, 300));
    expect(posts).toBe(1);
  } finally {
    feed.stop();
  }
});

test("a held message's re-send refused as provider_account_blocked lands the billing_locked card on the feed", async () => {
  let posts = 0;
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events")) return new Response("", { status: 200 });
    if (call.method === "POST" && call.url.endsWith("/messages"))
      return ++posts === 1
        ? json(409, { error: "turn running" })
        : json(409, BLOCKED);
    return json(200, { ok: true, messages: [] });
  });
  const feed = collectFeed("activity-held-blocked");
  try {
    await client().startSession(AGENT, {
      sessionKey: "activity-held-blocked",
      prompt: "and one more thing",
    });
    const card = await vi.waitUntil(
      () => feed.items.find((item) => item.feed_type === "provider_error"),
      { timeout: 5_000 },
    );
    expect(card).toMatchObject({
      feed_type: "provider_error",
      fails_pending: true,
      data: {
        kind: "unauthenticated",
        cause: "billing_locked",
        message: BLOCKED.error,
      },
    });
    expect(posts).toBe(2);
    await new Promise((r) => setTimeout(r, 300));
    expect(posts).toBe(2);
  } finally {
    feed.stop();
  }
});

test("Stop on a message still waiting for room ends it: the cancel goes out, no re-send follows", async () => {
  let posts = 0;
  stubRouted((call: Call) => {
    if (call.url.endsWith("/events")) return new Response("", { status: 200 });
    if (call.method === "POST" && call.url.endsWith("/messages")) {
      posts++;
      return json(503, {
        error: "engine unavailable",
        code: "compute_busy",
        retryAfterMs: 30_000,
      });
    }
    return json(200, { ok: true, cancelled: false, messages: [] });
  });
  const c = client();
  await c.startSession(AGENT, {
    sessionKey: "activity-busy-stop",
    prompt: "the weekly numbers, please",
  });
  await vi.waitUntil(() => posts === 1, { timeout: 5_000 });

  const result = await c.cancelSession(AGENT, "activity-busy-stop");

  expect(result).toEqual({ cancelled: true });
  const cancel = calls.find(
    (call) => call.method === "POST" && call.url.endsWith("/cancel"),
  );
  expect(cancel?.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/activity-busy-stop/cancel`,
  );
  expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  await new Promise((r) => setTimeout(r, 1_200));
  expect(posts).toBe(1);
});

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

const IMPORT = {
  importId: "onboarding:first_run",
  messages: [
    { role: "assistant" as const, content: "Hi Ana!" },
    { role: "user" as const, content: "Retail and e-commerce" },
  ],
};

function stubImport(imported: number) {
  stubRouted((call: Call) =>
    call.url.endsWith("/import")
      ? json(200, { ok: true, imported })
      : json(200, { id: SK, title: "t", messages: [], totalMessages: 0 }),
  );
}

test("importConversationMessages posts the import, then reads the tail window to re-seed the chat", async () => {
  stubImport(2);

  await expect(
    client().importConversationMessages(AGENT, SK, IMPORT),
  ).resolves.toEqual({ ok: true, imported: 2 });

  const [post, read] = calls;
  expect(calls).toHaveLength(2);
  expect(post.method).toBe("POST");
  expect(post.url).toBe(`${BASE}/agents/${AGENT}/conversations/${SK}/import`);
  expect(post.body).toBe(JSON.stringify(IMPORT));
  expect(post.headers.get("Content-Type")).toBe("application/json");
  expectGatewayHeaders(post);
  expect(read.method).toBe("GET");
  expect(read.url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/messages?limit=${CHAT_OPEN_WINDOW}`,
  );
});

test("an import that already landed reads nothing more", async () => {
  stubImport(0);
  await client().importConversationMessages(AGENT, SK, IMPORT);
  expect(onlyCall().url).toBe(
    `${BASE}/agents/${AGENT}/conversations/${SK}/import`,
  );
});

test("a refused import surfaces its status and is sent again by the retry", async () => {
  stubRouted(() => json(409, { error: "turn running" }));
  await expect(
    client().importConversationMessages(AGENT, SK, IMPORT),
  ).rejects.toMatchObject({ status: 409 });

  reset();
  stubImport(2);
  await expect(
    client().retryPendingConversationImports(AGENT),
  ).resolves.toEqual([]);
  expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
    [
      "POST",
      `${BASE}/agents/${AGENT}/conversations/${SK}/import`,
      JSON.stringify(IMPORT),
    ],
    [
      "GET",
      `${BASE}/agents/${AGENT}/conversations/${SK}/messages?limit=${CHAT_OPEN_WINDOW}`,
      null,
    ],
  ]);

  reset();
  await client().retryPendingConversationImports(AGENT);
  expect(calls).toEqual([]);
});
