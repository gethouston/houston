import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWireCapture,
  expectGatewayHeaders,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The per-agent policy (assignments, toolkit/model ceilings, model choice,
 * trigger status) rides `sdk.teams`.
 *
 * What these tests pin is the wire: the mixin method must issue exactly the
 * request recorded here, down to the URL, the method, the body bytes and the
 * auth/active-space headers — one request, never two. The degradations stay
 * adapter-side, so they are pinned here too: model choice and trigger status
 * read `null` on a 404 (a deployment that is single-player says so by not
 * serving the route), and every other failure surfaces.
 */

const BASE = "http://host";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
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

describe("the delegated per-agent policy", () => {
  test("assignments send every row's access verbatim, manager included", async () => {
    stubFetch(() => new Response(null, { status: 204 }));

    await client().setAgentAssignments("ag 1", [
      { userId: "u1", access: "manager" },
      { userId: "u2", access: "user" },
    ]);
    await client().setAgentAssignments("ag 1", []);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PUT ${BASE}/v1/agents/ag%201/assignments`,
      `PUT ${BASE}/v1/agents/ag%201/assignments`,
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      JSON.stringify({
        assignments: [
          { userId: "u1", access: "manager" },
          { userId: "u2", access: "user" },
        ],
      }),
      JSON.stringify({ assignments: [] }),
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

  test("the two single-player reads answer null, the policy writes refuse", async () => {
    await expect(solo().getAgentModelChoice("a1")).resolves.toBeNull();
    await expect(solo().agentTriggerStatus("a1")).resolves.toBeNull();
    await expect(solo().setAgentSettings("a1", {})).rejects.toThrow(
      "multiplayer requires the hosted gateway",
    );
  });
});
