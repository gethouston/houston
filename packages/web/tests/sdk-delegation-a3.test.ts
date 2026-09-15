import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";

/**
 * Migration wave A3 — C13 agent teams and the per-agent policy beside them
 * (assignments, toolkit/model ceilings, model choice, trigger status) move to
 * `sdk.teams`, and `cp/org-teams.ts`, `cp/org-team-members.ts` and
 * `cp/agent-teams.ts` are gone.
 *
 * What these tests pin is the wire: the delegated mixin method must issue the
 * request the control-plane helper issued, down to the URL, the method, the
 * body bytes and the auth/active-space headers — one request, never two. The
 * degradations stay adapter-side, so they are pinned here too: model choice and
 * trigger status read `null` on a 404 (a deployment that is single-player says
 * so by not serving the route), and NOTHING in the team directory degrades —
 * an empty rail presented as the truth is worse than the error.
 */

const BASE = "http://host";
const ORG = "abcdef0123456789"; // [a-f0-9]{16}

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

let calls: Call[];
const originalFetch = globalThis.fetch;

beforeEach(() => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  calls = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

/** Answer every request with `make()`, recording what was asked. */
function stubFetch(make: () => Response) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    return make();
  }) as unknown as typeof fetch;
}

const json = (status: number, body: unknown = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** A hosted client with an active space pinned, as the app runs in cloud. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

/** Every header `cpFetch` stamped on a teams call, on the delegated one. */
function expectGatewayHeaders(call: Call) {
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
}

const TEAM = {
  id: "t1",
  name: "Design",
  isDefault: false,
  sortOrder: 2,
  agentSlugs: ["a1"],
  memberCount: 3,
  joined: true,
  owner: false,
};

describe("the delegated team directory", () => {
  test("the list unwraps `teams` off one GET /v1/org/teams", async () => {
    stubFetch(() => json(200, { teams: [TEAM] }));

    await expect(client().listAgentTeams()).resolves.toEqual([TEAM]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/v1/org/teams`);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("creating posts exactly the fields the caller set", async () => {
    stubFetch(() => json(200, TEAM));

    await expect(
      client().createAgentTeam({ name: "Design", color: "teal" }),
    ).resolves.toEqual(TEAM);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/v1/org/teams`);
    expect(calls[0].body).toBe(
      JSON.stringify({ name: "Design", color: "teal" }),
    );
    expectGatewayHeaders(calls[0]);
  });

  test('the patch keeps `""` as the clear, and the id in its own segment', async () => {
    stubFetch(() => json(200, TEAM));

    await client().updateAgentTeam("a/b", { icon: "", context: "" });

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/v1/org/teams/a%2Fb`);
    expect(calls[0].body).toBe(JSON.stringify({ icon: "", context: "" }));
    expectGatewayHeaders(calls[0]);
  });

  test("deleting addresses the team's own route with no body", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await client().deleteAgentTeam("t 1");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toBe(`${BASE}/v1/org/teams/t%201`);
    expect(calls[0].body).toBeNull();
    expectGatewayHeaders(calls[0]);
  });

  test("a 404 on the rail is an error, never an empty team list", async () => {
    stubFetch(() => json(404, { error: "not found" }));

    const err = await client()
      .listAgentTeams()
      .catch((e) => e);

    expect(err).toBeInstanceOf(HoustonEngineError);
    expect(err.status).toBe(404);
  });
});

describe("the delegated membership calls", () => {
  test("the member list unwraps `members` off the team's route", async () => {
    stubFetch(() => json(200, { members: [{ userId: "u1", owner: true }] }));

    await expect(client().listAgentTeamMembers("t1")).resolves.toEqual([
      { userId: "u1", owner: true },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/v1/org/teams/t1/members`);
    expectGatewayHeaders(calls[0]);
  });

  test("a team id and a user id each stay in their own path segment", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await client().removeAgentTeamMember("a/b", "u/1");
    await client().setAgentTeamMemberOwner("a/b", "u/1", false);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `DELETE ${BASE}/v1/org/teams/a%2Fb/members/u%2F1`,
      `PUT ${BASE}/v1/org/teams/a%2Fb/members/u%2F1`,
    ]);
    expect(calls[0].body).toBeNull();
    // `false` must survive serialization: a dropped flag would silently leave
    // an owner in place.
    expect(calls[1].body).toBe(JSON.stringify({ owner: false }));
    for (const call of calls) expectGatewayHeaders(call);
  });

  test("filing an agent PUTs its own team route, the team id in the body", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await client().setAgentTeam("Houston/Bo", "t 2");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/Houston%2FBo/team`);
    expect(calls[0].body).toBe(JSON.stringify({ teamId: "t 2" }));
    expectGatewayHeaders(calls[0]);
  });
});

describe("the delegated per-agent policy", () => {
  test("assignments pick the v2 shape for rows and v1 for bare ids", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await client().setAgentAssignments("ag 1", [
      { userId: "u1", access: "manager" },
    ]);
    await client().setAgentAssignments("ag 1", ["u1"]);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PUT ${BASE}/v1/agents/ag%201/assignments`,
      `PUT ${BASE}/v1/agents/ag%201/assignments`,
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      JSON.stringify({ assignments: [{ userId: "u1", access: "manager" }] }),
      JSON.stringify({ userIds: ["u1"] }),
    ]);
    for (const call of calls) expectGatewayHeaders(call);
  });

  test("the ceilings read and write the agent's settings route", async () => {
    const settings = {
      allowedToolkits: ["gmail"],
      access: "manager",
      allowedModels: null,
    };
    stubFetch(() => json(200, settings));

    await expect(client().getAgentSettings("a1")).resolves.toEqual(settings);
    await client().setAgentSettings("a1", { allowedModels: null });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/agents/a1/settings`,
      `PUT ${BASE}/v1/agents/a1/settings`,
    ]);
    // A one-ceiling PUT must not carry the other key: the gateway merges, so an
    // invented `allowedToolkits: null` would erase a live allowlist.
    expect(calls[1].body).toBe(JSON.stringify({ allowedModels: null }));
    for (const call of calls) expectGatewayHeaders(call);
  });

  test("the model choice reads and writes the agent's model-choice route", async () => {
    const info = { choice: null, allowedModels: ["gpt-5"] };
    stubFetch(() => json(200, info));

    await expect(client().getAgentModelChoice("a1")).resolves.toEqual(info);
    await client().setAgentModelChoice("a1", {
      provider: "openai-codex",
      model: "gpt-5",
      effort: "high",
    });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/agents/a1/model-choice`,
      `PUT ${BASE}/v1/agents/a1/model-choice`,
    ]);
    expect(calls[1].body).toBe(
      JSON.stringify({
        provider: "openai-codex",
        model: "gpt-5",
        effort: "high",
      }),
    );
    for (const call of calls) expectGatewayHeaders(call);
  });

  test("trigger status unwraps `items` off the agent's route", async () => {
    const items = [{ routine_id: "r1", status: "active" }];
    stubFetch(() => json(200, { items }));

    await expect(client().agentTriggerStatus("a 1")).resolves.toEqual(items);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toBe(`${BASE}/v1/agents/a%201/trigger-status`);
    expectGatewayHeaders(calls[0]);
  });

  test("a 404 hides the model picker and the trigger badge, nothing else", async () => {
    stubFetch(() => json(404, { error: "not found" }));

    await expect(client().getAgentModelChoice("a1")).resolves.toBeNull();
    await expect(client().agentTriggerStatus("a1")).resolves.toBeNull();
    // The writes and the ceilings read still surface the host's reason.
    await expect(client().getAgentSettings("a1")).rejects.toThrow(
      HoustonEngineError,
    );
    await expect(
      client().setAgentModelChoice("a1", { provider: "p", model: "m" }),
    ).rejects.toThrow(HoustonEngineError);
  });

  test("every other failure still surfaces with the host's reason", async () => {
    stubFetch(() => json(500, { error: "policy exploded" }));

    const err = await client()
      .getAgentModelChoice("a1")
      .catch((e) => e);

    expect(err).toBeInstanceOf(HoustonEngineError);
    expect(err.status).toBe(500);
    expect(err.message).toBe("policy exploded (engine error 500)");
  });
});

describe("off-cloud, where multiplayer does not exist", () => {
  const solo = () => new HoustonClient({ baseUrl: BASE, token: "t" });

  test("every team call refuses rather than answer an empty rail", async () => {
    await expect(solo().listAgentTeams()).rejects.toThrow(
      "agent teams require the hosted gateway",
    );
    await expect(solo().createAgentTeam({ name: "Design" })).rejects.toThrow(
      "agent teams require the hosted gateway",
    );
    await expect(solo().setAgentTeam("a1", "t1")).rejects.toThrow(
      "agent teams require the hosted gateway",
    );
  });

  test("the two single-player reads answer null, the policy writes refuse", async () => {
    await expect(solo().getAgentModelChoice("a1")).resolves.toBeNull();
    await expect(solo().agentTriggerStatus("a1")).resolves.toBeNull();
    await expect(solo().setAgentSettings("a1", {})).rejects.toThrow(
      "multiplayer requires the hosted gateway",
    );
  });
});
