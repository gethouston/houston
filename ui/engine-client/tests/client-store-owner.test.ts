import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";
import type { MyAgent } from "../src/types.ts";

/**
 * Agent Store owner management ("my agents" panel): the front-door
 * `HoustonClient` methods that act on an owned listing by its gateway id.
 * `listMyStoreAgents` reads `GET /agentstore/me/agents`; the three lifecycle
 * mutations all PATCH the IDENTICAL `/agentstore/agents/{id}` URL and differ
 * ONLY by request body ({requestPublic} / {visibility:"unlisted"} / {unpublish})
 * — a swapped body would silently perform the wrong action, so each method
 * asserts its exact outgoing {method, url, body}. `deleteStoreAgentById` DELETEs
 * the same keyed URL.
 *
 * A capturing `fetchImpl` records the outgoing request and parses the JSON body
 * (all requests are prefixed `${baseUrl}/v1`).
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

function makeClient(response: { status?: number; body?: unknown } = {}): {
  client: HoustonClient;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:9999",
    token: "tok",
    fetchImpl: async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      return new Response(JSON.stringify(response.body ?? {}), {
        status: response.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const BASE = "http://127.0.0.1:9999/v1/agentstore";

describe("HoustonClient — store owner: listMyStoreAgents", () => {
  it("GETs /agentstore/me/agents and unwraps items", async () => {
    const items = [
      { id: "a1", name: "Alpha" },
      { id: "a2", name: "Beta" },
    ] as unknown as MyAgent[];
    const { client, calls } = makeClient({ body: { items } });
    const got = await client.listMyStoreAgents();
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, `${BASE}/me/agents`);
    strictEqual(calls[0].body, undefined);
    deepStrictEqual(got, items);
  });
});

describe("HoustonClient — store owner: lifecycle mutations (same URL, distinct body)", () => {
  const ID = "agent 7"; // exercises seg()/URL-encoding
  const ENC = `${BASE}/agents/agent%207`;

  it("requestStorePublic PATCHes {requestPublic:true}", async () => {
    const { client, calls } = makeClient();
    await client.requestStorePublic(ID);
    strictEqual(calls[0].method, "PATCH");
    strictEqual(calls[0].url, ENC);
    deepStrictEqual(calls[0].body, { requestPublic: true });
  });

  it("setStoreVisibilityUnlisted PATCHes {visibility:'unlisted'}", async () => {
    const { client, calls } = makeClient();
    await client.setStoreVisibilityUnlisted(ID);
    strictEqual(calls[0].method, "PATCH");
    strictEqual(calls[0].url, ENC);
    deepStrictEqual(calls[0].body, { visibility: "unlisted" });
  });

  it("unpublishStoreAgentById PATCHes {unpublish:true}", async () => {
    const { client, calls } = makeClient();
    await client.unpublishStoreAgentById(ID);
    strictEqual(calls[0].method, "PATCH");
    strictEqual(calls[0].url, ENC);
    deepStrictEqual(calls[0].body, { unpublish: true });
  });

  it("deleteStoreAgentById DELETEs the keyed URL with no body", async () => {
    const { client, calls } = makeClient();
    await client.deleteStoreAgentById(ID);
    strictEqual(calls[0].method, "DELETE");
    strictEqual(calls[0].url, ENC);
    strictEqual(calls[0].body, undefined);
  });
});
