import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * Warm-while-typing on the wire, byte for byte.
 *
 * The prewarm is a GATEWAY route (`/v1/agents/:slug/…`), not the agent-proxy
 * family the other conversation controls ride: a request that drifted onto
 * `/agents/:slug/…` would wake the agent's pod instead of readying a sandbox,
 * and nothing else in the suite would notice.
 */

const BASE = "https://gw.example";
const AGENT = "sales";
const ANSWER = { outcome: "launching", holdMs: 30_000 };
const PREWARM_ON = { conversationPrewarm: true };

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
  stubFetch(() => json(202, ANSWER));
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

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
  await c.draftChanged(draft, PREWARM_ON);
  await c.draftChanged({ ...draft, text: "hi there" }, PREWARM_ON);

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
  await expect(
    client().draftChanged(
      {
        agentId: AGENT,
        draftKey: "activity-c1",
        conversationId: "activity-c1",
        text: "hello",
      },
      PREWARM_ON,
    ),
  ).rejects.toMatchObject({ name: "HoustonEngineError", status: 503 });
});
