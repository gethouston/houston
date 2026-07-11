import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient, HoustonEngineError } from "../src/client.ts";

/**
 * C8 spaces client surface: `listOrgs` / `createOrg` / `moveAgent` /
 * `getMoveStatus`. A capturing `fetchImpl` records the outgoing `{method, url,
 * body}` so the exact wire request is asserted, and returns a canned body (at a
 * chosen status) so the parse/degrade side is covered too.
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
    // Tiny retry budget so a non-degrading error path resolves promptly.
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, deadlineMs: 50 },
    fetchImpl: async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response(JSON.stringify(responseBody), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const ORG = {
  id: "o1",
  slug: "0123456789abcdef",
  name: "Acme",
  kind: "team",
  role: "owner",
  memberCount: 1,
  degraded: false,
};

describe("HoustonClient C8 spaces — listOrgs", () => {
  it("GETs /orgs and returns the parsed {orgs, invites}", async () => {
    const payload = { orgs: [ORG], invites: [] };
    const { client, calls } = makeClient(payload);
    const got = await client.listOrgs();
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/orgs");
    deepStrictEqual(got, payload);
  });

  it("degrades a 404 to an empty result (off-spaces host)", async () => {
    const { client } = makeClient({}, 404);
    deepStrictEqual(await client.listOrgs(), { orgs: [], invites: [] });
  });

  it("does NOT degrade a non-404 error (throws)", async () => {
    const { client } = makeClient({}, 500);
    await rejects(() => client.listOrgs(), HoustonEngineError);
  });
});

describe("HoustonClient C8 spaces — createOrg", () => {
  it("POSTs /orgs with {name} and returns the OrgSummary", async () => {
    const { client, calls } = makeClient(ORG, 201);
    const got = await client.createOrg("Acme");
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/orgs");
    deepStrictEqual(calls[0].body, { name: "Acme" });
    deepStrictEqual(got, ORG);
  });

  it("does NOT degrade a 404 — a create failure throws for the UI", async () => {
    const { client } = makeClient({}, 404);
    await rejects(() => client.createOrg("Acme"), HoustonEngineError);
  });
});

describe("HoustonClient C8 spaces — moveAgent + getMoveStatus", () => {
  it("moveAgent POSTs /agents/:slug/move with {to} and returns {moveId}", async () => {
    const { client, calls } = makeClient({ moveId: "m1" }, 202);
    const got = await client.moveAgent("agent-1", "0123456789abcdef");
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/agents/agent-1/move");
    deepStrictEqual(calls[0].body, { to: "0123456789abcdef" });
    deepStrictEqual(got, { moveId: "m1" });
  });

  it("moveAgent does NOT degrade a 403 (throws the real error)", async () => {
    const { client } = makeClient({ error: "unsupported_move" }, 403);
    await rejects(
      () => client.moveAgent("agent-1", "0123456789abcdef"),
      HoustonEngineError,
    );
  });

  it("getMoveStatus GETs /agents/:slug/move/:moveId and returns the status", async () => {
    const status = { status: "done" };
    const { client, calls } = makeClient(status);
    const got = await client.getMoveStatus("agent-1", "m1");
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/move/m1",
    );
    deepStrictEqual(got, status);
  });
});
