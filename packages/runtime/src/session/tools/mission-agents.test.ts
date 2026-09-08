import { expect, test } from "vitest";
import { agentSummaryList, reachableAgentSummaries } from "./mission-agents";
import { resolveTargetAgent } from "./mission-params";
import type { SandboxFetch } from "./sandbox-fetch";

/**
 * The list a mission refusal offers instead of leaving the model to invent an
 * agent name. It is read through the host's assistant surface, which is
 * authorized for the personal assistant alone — the only runtime that can
 * reach the refusal.
 */

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

interface Sent {
  path: string;
  body: unknown;
}

function transport(answer: () => Response | Promise<Response>) {
  const sent: Sent[] = [];
  const call: SandboxFetch = async (path, init) => {
    sent.push({
      path,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return answer();
  };
  return { sent, call };
}

test("asks the assistant surface for listAgents and keeps id and name", async () => {
  const { sent, call } = transport(() =>
    reply(200, [
      { id: "a-1", name: "Dobby", createdAt: 1 },
      { id: "a-2", name: "Legal", createdAt: 2 },
    ]),
  );
  expect(await reachableAgentSummaries(call)).toEqual([
    { id: "a-1", name: "Dobby" },
    { id: "a-2", name: "Legal" },
  ]);
  expect(sent).toEqual([
    {
      path: "/sandbox/assistant/call",
      body: { operation: "listAgents", params: {} },
    },
  ]);
});

test("withholds Houston's own dot-named agents and malformed rows", async () => {
  const { call } = transport(() =>
    reply(200, [
      { id: "a-1", name: ".assistant" },
      { id: "a-2", name: "" },
      { id: "", name: "Nameless" },
      { name: "NoId" },
      "not an agent",
      { id: "a-3", name: "Legal" },
    ]),
  );
  expect(await reachableAgentSummaries(call)).toEqual([
    { id: "a-3", name: "Legal" },
  ]);
});

test("an unreadable list weakens the refusal instead of failing twice", async () => {
  for (const answer of [
    () => reply(503, { error: "no gateway" }),
    () => reply(200, { not: "an array" }),
    () => {
      throw new Error("offline");
    },
  ]) {
    const { call } = transport(answer);
    expect(await reachableAgentSummaries(call)).toEqual([]);
  }
});

test("spells the list the way a refusal reads it", () => {
  expect(
    agentSummaryList([
      { id: "a-1", name: "Dobby" },
      { id: "a-2", name: "Legal" },
    ]),
  ).toBe("Dobby (id a-1), Legal (id a-2)");
  expect(agentSummaryList([])).toBe("");
});

test("the assistant's missing-agent refusal names the agents that would work", async () => {
  const { call } = transport(() =>
    reply(200, [
      { id: "a-1", name: "Dobby" },
      { id: "a-2", name: ".assistant" },
    ]),
  );
  const out = await resolveTargetAgent(undefined, true, call);
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.error.code).toBe("agent_required");
  expect(out.error.message).toContain("Dobby (id a-1)");
  expect(out.error.message).not.toContain(".assistant");
});

test("a refusal with no readable list still says what to do next", async () => {
  const { call } = transport(() => reply(503, { error: "no gateway" }));
  const out = await resolveTargetAgent("   ", true, call);
  expect(out.ok).toBe(false);
  if (out.ok) return;
  expect(out.error.message).toContain("List the user's agents");
});

test("a named agent, and any non-assistant runtime, never consults the list", async () => {
  const { sent, call } = transport(() => reply(200, []));
  expect(await resolveTargetAgent(" Dobby ", true, call)).toEqual({
    ok: true,
    agent: "Dobby",
  });
  expect(await resolveTargetAgent(undefined, false, call)).toEqual({
    ok: true,
    agent: undefined,
  });
  expect(sent).toEqual([]);
});
