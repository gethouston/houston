import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";

/**
 * Multi-account integrations client surface (Element A): the grant unit is the
 * connected ACCOUNT (connection id), disconnect + rename are per-account, and
 * the grants wire is `{ accounts }`.
 *
 * A capturing `fetchImpl` records the outgoing `{method, url, body}` so we can
 * assert the exact wire request each method issues, and returns a canned
 * response so the parse/unwrap side is covered too. `status` lets a case drive
 * the 404 → null degrade path.
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

function makeClient(
  responseBody: unknown = {},
  status = 200,
): { client: HoustonClient; calls: Captured[] } {
  const calls: Captured[] = [];
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:9999",
    token: "tok",
    fetchImpl: async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response(
        status === 204 ? null : JSON.stringify(responseBody),
        {
          status,
          headers: { "content-type": "application/json" },
        },
      );
    },
  });
  return { client, calls };
}

describe("HoustonClient integrations — per-account disconnect + rename", () => {
  it("disconnectIntegration POSTs {connectionId} to /disconnect", async () => {
    const { client, calls } = makeClient();
    await client.disconnectIntegration("composio", "conn_123");
    strictEqual(calls.length, 1);
    strictEqual(calls[0].method, "POST");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/composio/disconnect",
    );
    deepStrictEqual(calls[0].body, { connectionId: "conn_123" });
  });

  it("renameIntegrationConnection POSTs {alias} to the account rename route", async () => {
    const { client, calls } = makeClient();
    await client.renameIntegrationConnection("composio", "conn_123", "Work");
    strictEqual(calls[0].method, "POST");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/composio/connections/conn_123/rename",
    );
    deepStrictEqual(calls[0].body, { alias: "Work" });
  });

  it("rename url-encodes the connection id segment", async () => {
    const { client, calls } = makeClient();
    await client.renameIntegrationConnection("composio", "a/b c", "x");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/composio/connections/a%2Fb%20c/rename",
    );
  });
});

describe("HoustonClient integrations — per-agent grants ({accounts} wire)", () => {
  it("agentIntegrationGrants GETs and unwraps {accounts} to connection ids", async () => {
    const { client, calls } = makeClient({ accounts: ["conn_a", "conn_b"] });
    const got = await client.agentIntegrationGrants("agent-1");
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/integration-grants",
    );
    deepStrictEqual(got, ["conn_a", "conn_b"]);
  });

  it("agentIntegrationGrants returns null on a 404 (grants unsupported)", async () => {
    const { client } = makeClient({ error: { code: "NOT_FOUND" } }, 404);
    const got = await client.agentIntegrationGrants("agent-1");
    strictEqual(got, null);
  });

  it("setAgentIntegrationGrants PUTs {accounts}", async () => {
    const { client, calls } = makeClient();
    await client.setAgentIntegrationGrants("agent-1", ["conn_a", "conn_b"]);
    strictEqual(calls[0].method, "PUT");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/integration-grants",
    );
    deepStrictEqual(calls[0].body, { accounts: ["conn_a", "conn_b"] });
  });
});
