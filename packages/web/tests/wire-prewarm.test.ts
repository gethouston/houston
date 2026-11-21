import { HoustonClient } from "@houston/engine-adapter/client";
import { PREWARM_TYPING_MS } from "@houston/sdk/draft-typing";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

const BASE = "https://gw.example";
const AGENT = "sales";
const ANSWER = { outcome: "launching", holdMs: 20_000 };
const PREWARM_ON = { conversationPrewarm: true };

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "performance"] });
  installLocalStorage();
  reset();
  stubFetch(() => json(202, ANSWER));
});

afterEach(() => {
  restore();
  vi.useRealTimers();
  vi.clearAllMocks();
});

type Draft = Parameters<HoustonClient["draftChanged"]>[0];

async function typeUpTo(c: HoustonClient, draft: Draft) {
  for (let t = 0; t < PREWARM_TYPING_MS; t += 250) {
    await c.draftChanged(draft, PREWARM_ON);
    vi.advanceTimersByTime(250);
  }
}

const client = () => {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
};

test("prewarmConversation posts the composer's pin to the gateway route", async () => {
  const answer = await client().prewarmConversation(AGENT, "activity-c1", {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
  });

  expect(answer).toEqual(ANSWER);
  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(
    `${BASE}/v1/agents/${AGENT}/conversations/activity-c1/prewarm`,
  );
  expect(post.body).toBe(
    '{"provider":"anthropic","model":"claude-sonnet-4-6"}',
  );
  expectGatewayHeaders(post);
});

test("prewarmConversation with no pin sends an empty object", async () => {
  await client().prewarmConversation(AGENT, "activity-c1");
  expect(calls.map((call) => call.body)).toEqual(["{}"]);
});

test("draftChanged on a new chat prewarms the id the first send claims", async () => {
  const c = client();
  const draft = {
    agentId: AGENT,
    draftKey: "new-conversation:board",
    text: "hi",
    model: "gpt-5.5",
  };
  await typeUpTo(c, draft);
  expect(calls).toEqual([]);
  await c.draftChanged({ ...draft, text: "hi there" }, PREWARM_ON);
  await c.draftChanged({ ...draft, text: "hi there!" }, PREWARM_ON);

  const id = c.claimNewConversationId(draft.draftKey);
  expect(calls).toHaveLength(1);
  const [post] = calls;
  expect(post.method).toBe("POST");
  expect(post.url).toBe(
    `${BASE}/v1/agents/${AGENT}/conversations/activity-${id}/prewarm`,
  );
  expect(post.body).toBe('{"model":"gpt-5.5"}');
  expectGatewayHeaders(post);
});

test("draftChanged without the capability puts nothing on the wire", async () => {
  await client().draftChanged(
    { agentId: AGENT, draftKey: "activity-c1", text: "hello" },
    undefined,
  );
  expect(calls).toEqual([]);
});

test("a refused prewarm rejects as the adapter's engine error", async () => {
  stubFetch(() =>
    json(503, { error: "prewarm not configured", code: "not_configured" }),
  );
  const c = client();
  const draft = {
    agentId: AGENT,
    draftKey: "activity-c1",
    conversationId: "activity-c1",
    text: "hello",
  };
  await typeUpTo(c, draft);
  await expect(c.draftChanged(draft, PREWARM_ON)).rejects.toMatchObject({
    name: "HoustonEngineError",
    status: 503,
  });
});
