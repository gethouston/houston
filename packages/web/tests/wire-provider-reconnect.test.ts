import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { wireAgent } from "./support/agent-list";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * A hosted Claude subscription login ends about 28 days after it. The gateway
 * puts the sign-in-again deadline on the provider list (`reconnectBy`, epoch
 * ms) for the caller's own login, and the provider status the app renders
 * must carry it through unchanged. These pin the read (`GET` on the agent's
 * provider list, no new route) and that only a row with a deadline grows the
 * field.
 */

const BASE = "http://host";
const AGENT = "agent-1";
const DEADLINE = 1_790_000_000_000;

const { calls, reset, restore, stubRouted } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

async function settled(providers: object[]): Promise<HoustonClient> {
  stubRouted((call) => {
    if (call.url.endsWith("/agents")) return json(200, [wireAgent(AGENT)]);
    if (call.url.endsWith("/providers")) return json(200, providers);
    return json(200, {});
  });
  const client = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  client.setActiveOrg(ORG);
  await client.listAgents("ws");
  reset();
  return client;
}

test("the provider status carries the gateway's reconnect deadline", async () => {
  const client = await settled([
    { id: "anthropic", configured: true, reconnectBy: DEADLINE },
    { id: "openai-codex", configured: true },
  ]);
  const [claude, codex] = await client.providerStatuses([
    "anthropic",
    "openai-codex",
  ]);

  const reads = calls.filter((call) => call.url.endsWith("/providers"));
  expect(reads).toHaveLength(1);
  expect(reads[0].url).toBe(`${BASE}/agents/${AGENT}/providers`);
  expect(reads[0].method).toBe("GET");
  expect(reads[0].body).toBeNull();
  expect(reads[0].headers.get("Authorization")).toBe("Bearer t");
  expect(reads[0].headers.get("x-houston-org")).toBe(ORG);

  expect(claude).toMatchObject({
    provider: "anthropic",
    authState: "authenticated",
    reconnectBy: DEADLINE,
  });
  expect(codex).not.toHaveProperty("reconnectBy");
});

test("an answer with no deadline keeps the status shape it always had", async () => {
  const client = await settled([{ id: "anthropic", configured: true }]);
  const [claude] = await client.providerStatuses(["anthropic"]);
  expect(claude).not.toHaveProperty("reconnectBy");
});
