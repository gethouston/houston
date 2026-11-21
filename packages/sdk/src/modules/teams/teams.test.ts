import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { TeamsCommand, TeamsHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

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

  it("keeps a plan skip it can explain and drops one it cannot", async () => {
    const skipped = {
      code: "plan_min_interval" as const,
      count: 21,
      last_at: "2026-10-05T19:43:49Z",
    };
    const { sdk } = ok({
      items: [
        { routine_id: "r1", status: "active", plan_skipped: skipped },
        {
          routine_id: "r2",
          status: "active",
          plan_skipped: { ...skipped, code: "plan_future_rule" },
        },
        { routine_id: "r3", status: "error", detail: "x", plan_skipped: null },
      ],
    });
    expect(await sdk.teams.agentTriggerStatus("a1")).toEqual([
      { routine_id: "r1", status: "active", plan_skipped: skipped },
      { routine_id: "r2", status: "active" },
      { routine_id: "r3", status: "error", detail: "x" },
    ]);
  });

  it("keeps a reason it can explain and drops one it cannot", async () => {
    const { sdk } = ok({
      items: [
        { routine_id: "r1", status: "error", reason: "trigger_type_gone" },
        { routine_id: "r2", status: "error", reason: "config_rejected" },
        { routine_id: "r3", status: "error", reason: "future_reason" },
        { routine_id: "r4", status: "paused_disconnected", reason: 7 },
      ],
    });
    expect(await sdk.teams.agentTriggerStatus("a1")).toEqual([
      { routine_id: "r1", status: "error", reason: "trigger_type_gone" },
      { routine_id: "r2", status: "error", reason: "config_rejected" },
      { routine_id: "r3", status: "error" },
      { routine_id: "r4", status: "paused_disconnected" },
    ]);
  });
});

describe("what the module refuses to soften", () => {
  it("throws a TeamsHttpError carrying the status — a 404 never degrades", async () => {
    const { sdk } = makeSdk(() => json({ error: "no teams here" }, 404));
    const err = await sdk.teams.getAgentSettings("a1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeamsHttpError);
    expect((err as TeamsHttpError).status).toBe(404);
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
  it("dispatches a ceiling write through the same handler the facade uses", async () => {
    const { sdk, calls } = ok();
    const result = await sdk.dispatch({
      id: "1",
      type: TeamsCommand.SetSettings,
      payload: { agentSlugOrId: "a1", settings: { allowedToolkits: [] } },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/v1/agents/a1/settings`);
    expect(calls[0].body).toBe('{"allowedToolkits":[]}');
  });

  it("dispatches an empty roster, which is a real write", async () => {
    const { sdk, calls } = ok();
    const result = await sdk.dispatch({
      id: "2",
      type: TeamsCommand.SetAssignments,
      payload: { agentSlugOrId: "a1", assignments: [] },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].body).toBe('{"assignments":[]}');
  });

  it("rejects an assignment write with no roster, without touching the wire", async () => {
    const { sdk, calls } = ok();
    const result = await sdk.dispatch({
      id: "3",
      type: TeamsCommand.SetAssignments,
      payload: { agentSlugOrId: "a1" },
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
