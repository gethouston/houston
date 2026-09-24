import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { TeamsCommand, TeamsHttpError } from "./index";

/**
 * C13 agent teams and the per-agent policy beside them, as the wire sees them.
 * Every one of the fourteen calls is asserted WHOLE — method, url and body —
 * because the gateway routes on the exact path and a drift (a query param, a
 * pluralized segment, a PATCH become PUT) is the kind of break no type check
 * and no unit test of the caller would catch.
 *
 * The encoding test is the other half: an id carrying a slash or a percent must
 * stay inside its own path segment, or `…/teams/a/b/members` would address a
 * route nobody wrote.
 *
 * Nothing here degrades. The `404` cases assert the throw, because the surfaces
 * that soften one (model choice, trigger status) do it themselves — the SDK
 * stays honest so every surface reads the same statuses.
 */

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
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

/**
 * A teams SDK over a mock `fetch` that records the whole wire. `reactivity` is
 * off, so every recorded call is one a teams operation made and nothing else —
 * which is what makes "exactly one request" an exact claim.
 */
function makeSdk(answer: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return answer();
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "content-type": "application/json" },
  });

const ok = (body: unknown = {}) => makeSdk(() => json(body));

describe("the team directory", () => {
  it("reads and writes hit exactly the C13 team routes", async () => {
    const { sdk, calls } = ok();
    await sdk.teams.listAgentTeams();
    await sdk.teams.createAgentTeam({ name: "Design" });
    await sdk.teams.updateAgentTeam("t1", { name: "Design", sortOrder: 2 });
    await sdk.teams.deleteAgentTeam("t1");
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/org/teams`, body: null },
      {
        method: "POST",
        url: `${BASE}/v1/org/teams`,
        body: '{"name":"Design"}',
      },
      {
        method: "PATCH",
        url: `${BASE}/v1/org/teams/t1`,
        body: '{"name":"Design","sortOrder":2}',
      },
      { method: "DELETE", url: `${BASE}/v1/org/teams/t1`, body: null },
    ]);
  });

  it('carries a team\'s identity on the same PATCH, with `""` as the clear', async () => {
    // C13 §Team identity: a string SETS, `""` CLEARS, an omitted key leaves the
    // field alone. Asserting the serialized body is what pins the clear — a `""`
    // dropped on the way out would make an icon impossible to take off again.
    const { sdk, calls } = ok();
    await sdk.teams.updateAgentTeam("t1", {
      icon: "pen-tool",
      color: "#5E6AD2",
    });
    await sdk.teams.updateAgentTeam("t1", { icon: "" });
    await sdk.teams.updateAgentTeam("t1", { color: "" });
    expect(calls.map((c) => c.body)).toEqual([
      '{"icon":"pen-tool","color":"#5E6AD2"}',
      '{"icon":""}',
      '{"color":""}',
    ]);
  });

  it("answers the created and patched team the gateway echoed", async () => {
    const { sdk } = ok(TEAM);
    expect(await sdk.teams.createAgentTeam({ name: "Design" })).toEqual(TEAM);
    expect(await sdk.teams.updateAgentTeam("t1", { name: "Design" })).toEqual(
      TEAM,
    );
  });
});

describe("team membership and where an agent is filed", () => {
  it("hits exactly the C13 member routes", async () => {
    const { sdk, calls } = ok();
    await sdk.teams.listAgentTeamMembers("t1");
    await sdk.teams.removeAgentTeamMember("t1", "u1");
    await sdk.teams.setAgentTeamMemberOwner("t1", "u1", true);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/org/teams/t1/members`, body: null },
      {
        method: "DELETE",
        url: `${BASE}/v1/org/teams/t1/members/u1`,
        body: null,
      },
      {
        method: "PUT",
        url: `${BASE}/v1/org/teams/t1/members/u1`,
        body: '{"owner":true}',
      },
    ]);
  });

  it("moves an agent by PUTting the agent's own team route", async () => {
    const { sdk, calls } = ok();
    await sdk.teams.setAgentTeam("agent-1", "t2");
    expect(calls).toEqual([
      {
        method: "PUT",
        url: `${BASE}/v1/agents/agent-1/team`,
        body: '{"teamId":"t2"}',
      },
    ]);
  });

  it("keeps a team id, a user id and an agent id each in their own segment", async () => {
    const { sdk, calls } = ok();
    await sdk.teams.listAgentTeamMembers("a/b");
    await sdk.teams.setAgentTeamMemberOwner("a/b", "u/1", false);
    await sdk.teams.setAgentTeam("Houston/Bo", "t 2");
    expect(calls.map((c) => c.url)).toEqual([
      `${BASE}/v1/org/teams/a%2Fb/members`,
      `${BASE}/v1/org/teams/a%2Fb/members/u%2F1`,
      `${BASE}/v1/agents/Houston%2FBo/team`,
    ]);
    // The moved-to team id travels in the BODY, so it is never encoded at all.
    expect(calls[2]?.body).toBe('{"teamId":"t 2"}');
  });

  it("tolerates a list answer with no array, and never invents one", async () => {
    const { sdk } = ok({ other: 1 });
    expect(await sdk.teams.listAgentTeams()).toEqual([]);
    expect(await sdk.teams.listAgentTeamMembers("t1")).toEqual([]);
  });
});

describe("per-agent policy", () => {
  it("sends the v2 assignments shape when the caller passes rows", async () => {
    const { sdk, calls } = ok();
    await sdk.teams.setAgentAssignments("ag 1", [
      { userId: "u1", access: "manager" },
    ]);
    expect(calls).toEqual([
      {
        method: "PUT",
        url: `${BASE}/v1/agents/ag%201/assignments`,
        body: '{"assignments":[{"userId":"u1","access":"manager"}]}',
      },
    ]);
  });

  it("sends every row's own access, and an empty roster as an empty list", async () => {
    // No id-only shorthand exists: a shorthand could only guess ONE level, and
    // the level it would guess ("user") silently demotes every manager it is
    // handed. An empty list is a real roster — the gateway reads it as
    // "everyone" — never a skipped write.
    const { sdk, calls } = ok();
    await sdk.teams.setAgentAssignments("a1", [
      { userId: "u1", access: "manager" },
      { userId: "u2", access: "user" },
    ]);
    await sdk.teams.setAgentAssignments("a1", []);
    expect(calls.map((c) => c.body)).toEqual([
      '{"assignments":[{"userId":"u1","access":"manager"},{"userId":"u2","access":"user"}]}',
      '{"assignments":[]}',
    ]);
  });

  it("reads and writes the manager-set ceilings on one agent", async () => {
    const settings = {
      allowedToolkits: ["gmail"],
      access: "manager" as const,
      allowedModels: null,
    };
    const { sdk, calls } = ok(settings);
    expect(await sdk.teams.getAgentSettings("a1")).toEqual(settings);
    await sdk.teams.setAgentSettings("a1", { allowedModels: null });
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/agents/a1/settings`, body: null },
      {
        method: "PUT",
        url: `${BASE}/v1/agents/a1/settings`,
        body: '{"allowedModels":null}',
      },
    ]);
  });

  it("reads and writes the acting user's model choice", async () => {
    const info = { choice: null, allowedModels: ["gpt-5"] };
    const { sdk, calls } = ok(info);
    expect(await sdk.teams.getAgentModelChoice("a1")).toEqual(info);
    await sdk.teams.setAgentModelChoice("a1", {
      provider: "openai-codex",
      model: "gpt-5",
      effort: "high",
    });
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/agents/a1/model-choice`, body: null },
      {
        method: "PUT",
        url: `${BASE}/v1/agents/a1/model-choice`,
        body: '{"provider":"openai-codex","model":"gpt-5","effort":"high"}',
      },
    ]);
  });

  it("unwraps the {items} envelope trigger status answers with", async () => {
    const items = [{ routine_id: "r1", status: "active" as const }];
    const { sdk, calls } = ok({ items });
    expect(await sdk.teams.agentTriggerStatus("a1")).toEqual(items);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/agents/a1/trigger-status`, body: null },
    ]);
  });
});

describe("what the module refuses to soften", () => {
  it("throws a TeamsHttpError carrying the status — a 404 never degrades", async () => {
    const { sdk } = makeSdk(() => json({ error: "no teams here" }, 404));
    const err = await sdk.teams.listAgentTeams().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeamsHttpError);
    expect((err as TeamsHttpError).status).toBe(404);
    // The body travels as the message, which is what the web adapter parses
    // back into a HoustonEngineError.
    expect((err as TeamsHttpError).message).toBe(
      JSON.stringify({ error: "no teams here" }),
    );
  });

  it("lets a pre-Teams gateway's 404 reach the model-choice caller", async () => {
    const { sdk } = makeSdk(() => json({ error: "not found" }, 404));
    const err = await sdk.teams
      .getAgentModelChoice("a1")
      .catch((e: unknown) => e);
    expect((err as TeamsHttpError).status).toBe(404);
  });

  it("lets a trigger-less gateway's 404 reach the trigger-status caller", async () => {
    const { sdk } = makeSdk(() => json({ error: "not found" }, 404));
    const err = await sdk.teams
      .agentTriggerStatus("a1")
      .catch((e: unknown) => e);
    expect((err as TeamsHttpError).status).toBe(404);
  });
});

describe("the dispatch path", () => {
  it("dispatches a rename through the same handler the facade uses", async () => {
    const { sdk, calls } = ok(TEAM);
    const result = await sdk.dispatch({
      id: "1",
      type: TeamsCommand.Update,
      payload: { teamId: "t1", patch: { name: "Design" } },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/v1/org/teams/t1`);
    expect(calls[0].body).toBe('{"name":"Design"}');
  });

  it("dispatches an owner flag, false included", async () => {
    const { sdk, calls } = ok();
    const result = await sdk.dispatch({
      id: "2",
      type: TeamsCommand.SetMemberOwner,
      payload: { teamId: "t1", userId: "u1", owner: false },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].body).toBe('{"owner":false}');
  });

  it("rejects a member removal with no user named, without touching the wire", async () => {
    const { sdk, calls } = ok();
    const result = await sdk.dispatch({
      id: "3",
      type: TeamsCommand.RemoveMember,
      payload: { teamId: "t1" },
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
