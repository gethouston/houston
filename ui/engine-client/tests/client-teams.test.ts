import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";

/**
 * Teams v2 client surface (contract §5/§6): the new settings/audit/usage/invite
 * methods and the dual-shape `setAgentAssignments`.
 *
 * A capturing `fetchImpl` records the outgoing `{method, url, body}` so we can
 * assert the exact wire request each method issues, and return a canned JSON
 * body so the parse/unwrap side is covered too.
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

function makeClient(responseBody: unknown = {}): {
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
          typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

describe("HoustonClient Teams v2 — setAgentAssignments dual shape", () => {
  it("sends {assignments} for an AgentAssignment[] argument", async () => {
    const { client, calls } = makeClient();
    await client.setAgentAssignments("agent-1", [
      { userId: "u1", access: "manager" },
      { userId: "u2", access: "user" },
    ]);
    strictEqual(calls.length, 1);
    strictEqual(calls[0].method, "PUT");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/assignments",
    );
    deepStrictEqual(calls[0].body, {
      assignments: [
        { userId: "u1", access: "manager" },
        { userId: "u2", access: "user" },
      ],
    });
  });

  it("sends {userIds} for a legacy string[] argument", async () => {
    const { client, calls } = makeClient();
    await client.setAgentAssignments("agent-1", ["u1", "u2"]);
    deepStrictEqual(calls[0].body, { userIds: ["u1", "u2"] });
  });

  it("sends {userIds: []} for an empty array (legacy 'everyone')", async () => {
    const { client, calls } = makeClient();
    await client.setAgentAssignments("agent-1", []);
    deepStrictEqual(calls[0].body, { userIds: [] });
  });
});

describe("HoustonClient Teams v2 — agent settings", () => {
  it("getAgentSettings GETs /agents/:id/settings and returns the body", async () => {
    const settings = {
      allowedToolkits: ["gmail"],
      access: "manager",
    };
    const { client, calls } = makeClient(settings);
    const got = await client.getAgentSettings("agent-1");
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/settings",
    );
    deepStrictEqual(got, settings);
  });

  it("setAgentSettings PUTs the allowedToolkits body", async () => {
    const { client, calls } = makeClient();
    await client.setAgentSettings("agent-1", { allowedToolkits: null });
    strictEqual(calls[0].method, "PUT");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/agent-1/settings",
    );
    deepStrictEqual(calls[0].body, { allowedToolkits: null });
  });
});

describe("HoustonClient Teams v2 — invites, audit, usage", () => {
  it("addOrgMember returns the parsed 202 invite body", async () => {
    const { client, calls } = makeClient({
      invited: true,
      email: "new@x.io",
      role: "user",
    });
    const res = await client.addOrgMember("new@x.io", "user");
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/members");
    deepStrictEqual(res, { invited: true, email: "new@x.io", role: "user" });
  });

  it("deleteOrgInvite DELETEs /org/invites/:id", async () => {
    const { client, calls } = makeClient();
    await client.deleteOrgInvite("inv-1");
    strictEqual(calls[0].method, "DELETE");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/invites/inv-1");
  });

  it("orgAudit passes before/limit query and unwraps entries", async () => {
    const entries = [
      {
        id: 2,
        orgId: "o",
        actor: "a",
        action: "agent.rename",
        subject: {},
        createdAt: 5,
      },
    ];
    const { client, calls } = makeClient({ entries });
    const got = await client.orgAudit({ before: 10, limit: 50 });
    strictEqual(calls[0].method, "GET");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/org/audit?before=10&limit=50",
    );
    deepStrictEqual(got, entries);
  });

  it("orgAudit omits absent query params", async () => {
    const { client, calls } = makeClient({ entries: [] });
    await client.orgAudit();
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/audit");
  });

  it("orgUsage passes days and unwraps rows", async () => {
    const rows = [
      { agentSlug: "s", userId: "u", day: "2026-07-05", messages: 3 },
    ];
    const { client, calls } = makeClient({ rows });
    const got = await client.orgUsage(30);
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/usage?days=30");
    deepStrictEqual(got, rows);
  });
});
