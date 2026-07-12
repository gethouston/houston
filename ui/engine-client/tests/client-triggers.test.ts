import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient, HoustonEngineError } from "../src/client.ts";

/**
 * C9 event-driven routines client surface: the trigger catalog
 * (`GET /v1/integrations/composio/trigger-types?toolkit=`) and the per-routine
 * provisioning status (`GET /v1/agents/:id/trigger-status`), including the
 * 404-degrade-to-null on a host that predates triggers (desktop).
 *
 * A capturing `fetchImpl` records the outgoing `{method, url}` so we can assert
 * the exact wire request, and returns a canned body (or a 404) so the
 * unwrap/degrade paths are covered.
 */

interface Captured {
  method: string;
  url: string;
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
      calls.push({ method: init?.method ?? "GET", url: String(url) });
      return new Response(JSON.stringify(response.body ?? {}), {
        status: response.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

describe("HoustonClient — trigger catalog", () => {
  it("triggerTypes GETs the toolkit-scoped catalog and unwraps items", async () => {
    const items = [
      {
        slug: "GMAIL_NEW_GMAIL_MESSAGE",
        name: "New email",
        description: "A new email arrived",
        type: "webhook",
        config: { properties: {} },
        payload: { properties: { subject: { type: "string" } } },
      },
      {
        slug: "GMAIL_NEW_LABELED_EMAIL",
        name: "New labeled email",
        type: "poll",
        config: {},
      },
    ];
    const { client, calls } = makeClient({ body: { items } });
    const got = await client.triggerTypes("gmail");
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/integrations/composio/trigger-types?toolkit=gmail",
    );
    deepStrictEqual(got, items);
  });

  it("triggerTypes returns [] when the catalog is empty", async () => {
    const { client } = makeClient({ body: { items: [] } });
    deepStrictEqual(await client.triggerTypes("slack"), []);
  });
});

describe("HoustonClient — agent trigger status", () => {
  it("agentTriggerStatus GETs /trigger-status and unwraps items", async () => {
    const items = [
      { routine_id: "r1", status: "active" },
      {
        routine_id: "r2",
        status: "paused_disconnected",
        detail: "Reconnect Gmail",
      },
    ];
    const { client, calls } = makeClient({ body: { items } });
    const got = await client.agentTriggerStatus("agent-1");
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/trigger-status",
    );
    deepStrictEqual(got, items);
  });

  it("agentTriggerStatus degrades to null on a 404 (triggers unsupported)", async () => {
    const { client } = makeClient({ status: 404, body: { error: {} } });
    strictEqual(await client.agentTriggerStatus("agent-1"), null);
  });

  it("agentTriggerStatus rethrows a non-404 engine error", async () => {
    const { client } = makeClient({ status: 500, body: { error: {} } });
    await rejects(
      () => client.agentTriggerStatus("agent-1"),
      (err: unknown) => err instanceof HoustonEngineError && err.status === 500,
    );
  });
});
