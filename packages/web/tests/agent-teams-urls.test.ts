import { afterEach, expect, test } from "vitest";
import {
  createAgentTeam,
  deleteAgentTeam,
  joinAgentTeam,
  listAgentTeamMembers,
  listAgentTeams,
  removeAgentTeamMember,
  setAgentTeam,
  setAgentTeamMemberOwner,
  updateAgentTeam,
} from "../src/engine-adapter/cp/org-teams";

/**
 * C13 agent teams, the URL contract. Every one of the nine calls is asserted
 * WHOLE — method, url and body — because the gateway routes on the exact path
 * and a drift (a query param, a pluralized segment, a PATCH become PUT) is the
 * kind of break no type checks and no unit test of the caller would catch.
 *
 * The last test is the encoding one: an id carrying a slash or a percent must
 * stay inside its own path segment, or `…/teams/a/b/members` would address a
 * route nobody wrote.
 */

const cfg = { baseUrl: "http://gw.test", token: "t" };

interface Call {
  method: string;
  url: string;
  body: string | undefined;
}

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

/** Swap the global fetch (what `cpFetch` resolves at call time) and record calls. */
function capture(payload = "{}") {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: String(url),
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(payload, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = original;
  };
  return calls;
}

test("the team reads and writes hit exactly the C13 team routes", async () => {
  const calls = capture();
  await listAgentTeams(cfg);
  await createAgentTeam(cfg, { name: "Design" });
  await updateAgentTeam(cfg, "t1", { name: "Design", sortOrder: 2 });
  await deleteAgentTeam(cfg, "t1");
  expect(calls).toEqual([
    { method: "GET", url: "http://gw.test/v1/org/teams", body: undefined },
    {
      method: "POST",
      url: "http://gw.test/v1/org/teams",
      body: '{"name":"Design"}',
    },
    {
      method: "PATCH",
      url: "http://gw.test/v1/org/teams/t1",
      body: '{"name":"Design","sortOrder":2}',
    },
    {
      method: "DELETE",
      url: "http://gw.test/v1/org/teams/t1",
      body: undefined,
    },
  ]);
});

test('a team\'s identity rides the same PATCH, with `""` as the clear', async () => {
  // C13 §Team identity: a string SETS, `""` CLEARS, an omitted key leaves the
  // field alone. Asserting the serialized body is what pins the clear — a `""`
  // dropped on the way out would make an icon impossible to take off again.
  const calls = capture();
  await updateAgentTeam(cfg, "t1", { icon: "pen-tool", color: "#5E6AD2" });
  await updateAgentTeam(cfg, "t1", { icon: "" });
  await updateAgentTeam(cfg, "t1", { color: "" });
  expect(calls).toEqual([
    {
      method: "PATCH",
      url: "http://gw.test/v1/org/teams/t1",
      body: '{"icon":"pen-tool","color":"#5E6AD2"}',
    },
    {
      method: "PATCH",
      url: "http://gw.test/v1/org/teams/t1",
      body: '{"icon":""}',
    },
    {
      method: "PATCH",
      url: "http://gw.test/v1/org/teams/t1",
      body: '{"color":""}',
    },
  ]);
});

test("the membership calls hit exactly the C13 member routes", async () => {
  const calls = capture();
  await listAgentTeamMembers(cfg, "t1");
  await joinAgentTeam(cfg, "t1");
  await removeAgentTeamMember(cfg, "t1", "u1");
  await setAgentTeamMemberOwner(cfg, "t1", "u1", true);
  expect(calls).toEqual([
    {
      method: "GET",
      url: "http://gw.test/v1/org/teams/t1/members",
      body: undefined,
    },
    {
      method: "POST",
      url: "http://gw.test/v1/org/teams/t1/join",
      body: undefined,
    },
    {
      method: "DELETE",
      url: "http://gw.test/v1/org/teams/t1/members/u1",
      body: undefined,
    },
    {
      method: "PUT",
      url: "http://gw.test/v1/org/teams/t1/members/u1",
      body: '{"owner":true}',
    },
  ]);
});

test("moving an agent PUTs the agent's own team route", async () => {
  const calls = capture();
  await setAgentTeam(cfg, "agent-1", "t2");
  expect(calls).toEqual([
    {
      method: "PUT",
      url: "http://gw.test/v1/agents/agent-1/team",
      body: '{"teamId":"t2"}',
    },
  ]);
});

test("a team id, a user id and an agent id each stay in their own path segment", async () => {
  const calls = capture();
  await listAgentTeamMembers(cfg, "a/b");
  await setAgentTeamMemberOwner(cfg, "a/b", "u/1", false);
  await setAgentTeam(cfg, "Houston/Bo", "t 2");
  expect(calls.map((c) => c.url)).toEqual([
    "http://gw.test/v1/org/teams/a%2Fb/members",
    "http://gw.test/v1/org/teams/a%2Fb/members/u%2F1",
    "http://gw.test/v1/agents/Houston%2FBo/team",
  ]);
  // The moved-to team id travels in the BODY, so it is never encoded at all.
  expect(calls[2]?.body).toBe('{"teamId":"t 2"}');
});

test("the list reads tolerate an answer with no array, and never invent one", async () => {
  capture('{"other":1}');
  expect(await listAgentTeams(cfg)).toEqual([]);
  expect(await listAgentTeamMembers(cfg, "t1")).toEqual([]);
});
