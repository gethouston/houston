import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient, HoustonEngineError } from "../src/client.ts";

/**
 * C13 agent-teams client surface: the nine methods behind `capabilities
 * .agentTeams`. A capturing `fetchImpl` records the outgoing `{method, url,
 * body}` so the exact wire request is asserted, and returns a canned body (at a
 * chosen status) so the parse side is covered too.
 *
 * The last describe block is the load-bearing one: unlike `listOrgs` /
 * `getOrgPeople`, NOTHING here degrades a 404 — the caller feature-detects
 * first, so a 404 means the host lied and must reach the user.
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
      // A 204 carries no body at all — `new Response("…", {status: 204})`
      // throws, and the client's own empty-body branch is what we exercise.
      if (status === 204) return new Response(null, { status });
      return new Response(JSON.stringify(responseBody), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const TEAM = {
  id: "t1",
  name: "Design",
  isDefault: false,
  sortOrder: 1,
  agentSlugs: ["0123456789abcdef"],
  memberCount: 3,
  joined: true,
  owner: false,
};

describe("HoustonClient C13 agent teams — listAgentTeams", () => {
  it("GETs /org/teams and returns body.teams", async () => {
    const { client, calls } = makeClient({ teams: [TEAM] });
    const got = await client.listAgentTeams();
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/teams");
    strictEqual(calls[0].body, undefined);
    deepStrictEqual(got, [TEAM]);
  });

  it("returns [] when the host omits `teams` entirely", async () => {
    const { client } = makeClient({});
    deepStrictEqual(await client.listAgentTeams(), []);
  });
});

describe("HoustonClient C13 agent teams — createAgentTeam", () => {
  it("POSTs /org/teams with {name} and returns the AgentTeam", async () => {
    const { client, calls } = makeClient(TEAM, 201);
    const got = await client.createAgentTeam("Design");
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/teams");
    deepStrictEqual(calls[0].body, { name: "Design" });
    deepStrictEqual(got, TEAM);
  });
});

describe("HoustonClient C13 agent teams — updateAgentTeam", () => {
  it("PATCHes /org/teams/:id with the partial patch and returns the team", async () => {
    const { client, calls } = makeClient({ ...TEAM, name: "Brand" });
    const got = await client.updateAgentTeam("t1", { name: "Brand" });
    strictEqual(calls[0].method, "PATCH");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/teams/t1");
    deepStrictEqual(calls[0].body, { name: "Brand" });
    strictEqual(got.name, "Brand");
  });

  it("sends sortOrder alone, so a reorder cannot clobber the name", async () => {
    const { client, calls } = makeClient(TEAM);
    await client.updateAgentTeam("t1", { sortOrder: 4 });
    deepStrictEqual(calls[0].body, { sortOrder: 4 });
  });

  it("percent-encodes the team id into a single path segment", async () => {
    const { client, calls } = makeClient(TEAM);
    await client.updateAgentTeam("a/b c", { name: "x" });
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/teams/a%2Fb%20c");
  });
});

describe("HoustonClient C13 agent teams — deleteAgentTeam", () => {
  it("DELETEs /org/teams/:id and resolves on the 204", async () => {
    const { client, calls } = makeClient(undefined, 204);
    strictEqual(await client.deleteAgentTeam("t1"), undefined);
    strictEqual(calls[0].method, "DELETE");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/teams/t1");
    strictEqual(calls[0].body, undefined);
  });

  it("throws the 400 default_team refusal instead of pretending it worked", async () => {
    const { client } = makeClient(
      { error: "default team", code: "default_team" },
      400,
    );
    await rejects(() => client.deleteAgentTeam("t1"), HoustonEngineError);
  });
});

describe("HoustonClient C13 agent teams — listAgentTeamMembers", () => {
  it("GETs /org/teams/:id/members and returns body.members", async () => {
    const members = [{ userId: "u1", owner: true }];
    const { client, calls } = makeClient({ members });
    const got = await client.listAgentTeamMembers("t1");
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/teams/t1/members");
    deepStrictEqual(got, members);
  });

  it("returns [] when the host omits `members` entirely", async () => {
    const { client } = makeClient({});
    deepStrictEqual(await client.listAgentTeamMembers("t1"), []);
  });
});

describe("HoustonClient C13 agent teams — joinAgentTeam", () => {
  it("POSTs /org/teams/:id/join with no body", async () => {
    const { client, calls } = makeClient(undefined, 204);
    strictEqual(await client.joinAgentTeam("t1"), undefined);
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/org/teams/t1/join");
    strictEqual(calls[0].body, undefined);
  });
});

describe("HoustonClient C13 agent teams — removeAgentTeamMember", () => {
  it("DELETEs /org/teams/:id/members/:userId", async () => {
    const { client, calls } = makeClient(undefined, 204);
    strictEqual(await client.removeAgentTeamMember("t1", "u1"), undefined);
    strictEqual(calls[0].method, "DELETE");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/org/teams/t1/members/u1",
    );
  });

  it("percent-encodes both ids into their own segments", async () => {
    const { client, calls } = makeClient(undefined, 204);
    await client.removeAgentTeamMember("t/1", "u 1");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/org/teams/t%2F1/members/u%201",
    );
  });
});

describe("HoustonClient C13 agent teams — setAgentTeamMemberOwner", () => {
  it("PUTs /org/teams/:id/members/:userId with {owner}", async () => {
    const { client, calls } = makeClient(undefined, 204);
    strictEqual(
      await client.setAgentTeamMemberOwner("t1", "u1", true),
      undefined,
    );
    strictEqual(calls[0].method, "PUT");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/org/teams/t1/members/u1",
    );
    deepStrictEqual(calls[0].body, { owner: true });
  });

  it("sends owner:false rather than omitting it, so a demotion is explicit", async () => {
    const { client, calls } = makeClient(undefined, 204);
    await client.setAgentTeamMemberOwner("t1", "u1", false);
    deepStrictEqual(calls[0].body, { owner: false });
  });
});

describe("HoustonClient C13 agent teams — setAgentTeam", () => {
  it("PUTs /agents/:slug/team with {teamId}", async () => {
    const { client, calls } = makeClient(undefined, 204);
    strictEqual(await client.setAgentTeam("0123456789abcdef", "t1"), undefined);
    strictEqual(calls[0].method, "PUT");
    strictEqual(
      calls[0].url,
      "http://127.0.0.1:9999/v1/agents/0123456789abcdef/team",
    );
    deepStrictEqual(calls[0].body, { teamId: "t1" });
  });

  it("percent-encodes the agent slug into a single path segment", async () => {
    const { client, calls } = makeClient(undefined, 204);
    await client.setAgentTeam("a/b", "t1");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/agents/a%2Fb/team");
  });

  it("throws the 400 invalid_team_id rejection", async () => {
    const { client } = makeClient(
      { error: "invalid team id", code: "invalid_team_id" },
      400,
    );
    await rejects(() => client.setAgentTeam("a1", ""), HoustonEngineError);
  });
});

describe("HoustonClient C13 agent teams — a 404 throws, it is NOT degraded", () => {
  // The caller gates on `capabilities.agentTeams` before it ever calls these,
  // so a 404 means the host advertised the surface and then denied it. Turning
  // that into `[]` would blank the rail and present "you have no teams" as the
  // truth. Every one of the nine must surface it.
  const cases: Array<[string, (c: HoustonClient) => Promise<unknown>]> = [
    ["listAgentTeams", (c) => c.listAgentTeams()],
    ["createAgentTeam", (c) => c.createAgentTeam("Design")],
    ["updateAgentTeam", (c) => c.updateAgentTeam("t1", { name: "x" })],
    ["deleteAgentTeam", (c) => c.deleteAgentTeam("t1")],
    ["listAgentTeamMembers", (c) => c.listAgentTeamMembers("t1")],
    ["joinAgentTeam", (c) => c.joinAgentTeam("t1")],
    ["removeAgentTeamMember", (c) => c.removeAgentTeamMember("t1", "u1")],
    [
      "setAgentTeamMemberOwner",
      (c) => c.setAgentTeamMemberOwner("t1", "u1", true),
    ],
    ["setAgentTeam", (c) => c.setAgentTeam("a1", "t1")],
  ];

  for (const [name, invoke] of cases) {
    it(`${name} throws on 404`, async () => {
      const { client } = makeClient({ error: "not found" }, 404);
      await rejects(() => invoke(client), HoustonEngineError);
    });
  }
});
