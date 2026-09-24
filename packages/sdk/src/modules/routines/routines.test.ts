import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { RoutinesCommand, RoutinesHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/**
 * An inert SDK (`reactivity:false`) over a mock `fetch` that records the whole
 * request and answers whatever the test queues. Routines ride agent-proxy paths
 * (`/agents/:id/…`) except the webhook mint, which is a gateway CONTROL route
 * (`/v1/agents/…`) — every assertion here is about the exact URL, method and
 * body bytes that reach the wire, because getting that prefix wrong routes the
 * mint at a pod that never serves it.
 *
 * Nothing degrades: the one 404 tolerance this family has (webhook keys
 * unsupported) belongs to the CALLER, or a surface would be handed a `null` it
 * cannot tell from a gateway that simply failed.
 */
function makeSdk(respond: (url: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond(String(input));
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

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ROUTINE = {
  id: "r1",
  name: "Daily digest",
  prompt: "Summarize the inbox",
  schedule: "0 9 * * *",
  enabled: true,
  suppress_when_silent: false,
  chat_mode: "shared",
  integrations: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const RUN = {
  id: "run1",
  routine_id: "r1",
  status: "running",
  session_key: "sk-1",
  started_at: "2026-01-01T09:00:00.000Z",
};

describe("routines module — an agent's scheduled work", () => {
  it("unwraps the routine list off the agent's proxy path", async () => {
    const { sdk, calls } = makeSdk(() => json({ items: [ROUTINE] }));

    await expect(sdk.routines.listRoutines("a1")).resolves.toEqual([ROUTINE]);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/agents/a1/routines`, body: null },
    ]);
  });

  it("reads the run history off its own collection", async () => {
    const { sdk, calls } = makeSdk(() => json({ items: [RUN] }));

    await expect(sdk.routines.listRoutineRuns("a1")).resolves.toEqual([RUN]);
    expect(calls[0].url).toBe(`${BASE}/agents/a1/routine_runs`);
  });

  it("posts the whole new routine as the body", async () => {
    const { sdk, calls } = makeSdk(() => json(ROUTINE));
    const input = {
      name: "Daily digest",
      prompt: "Summarize the inbox",
      schedule: "0 9 * * *",
    };

    await expect(sdk.routines.createRoutine("a1", input)).resolves.toEqual(
      ROUTINE,
    );
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/a1/routines`,
        body: JSON.stringify(input),
      },
    ]);
  });

  it("patches only the fields the caller changed", async () => {
    const { sdk, calls } = makeSdk(() => json(ROUTINE));

    await sdk.routines.updateRoutine("a1", "r1", { schedule: "0 10 * * *" });
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].url).toBe(`${BASE}/agents/a1/routines/r1`);
    expect(calls[0].body).toBe(JSON.stringify({ schedule: "0 10 * * *" }));
  });

  it("deletes a routine with no body", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 204 }));

    await expect(
      sdk.routines.deleteRoutine("a1", "r1"),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([
      { method: "DELETE", url: `${BASE}/agents/a1/routines/r1`, body: null },
    ]);
  });

  it("fires a routine now against its /run sub-path", async () => {
    const { sdk, calls } = makeSdk(() => new Response(null, { status: 202 }));

    await sdk.routines.runRoutineNow("a1", "r1");
    expect(calls).toEqual([
      { method: "POST", url: `${BASE}/agents/a1/routines/r1/run`, body: null },
    ]);
  });

  it("cancels a run through the routine that owns it", async () => {
    const { sdk, calls } = makeSdk(() => json({ ...RUN, status: "cancelled" }));

    await expect(
      sdk.routines.cancelRoutineRun("a1", "r1", "run1"),
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(calls[0].url).toBe(`${BASE}/agents/a1/routines/r1/runs/run1/cancel`);
  });

  it("mints the webhook key on the GATEWAY control route, not the agent proxy", async () => {
    const reveal = {
      url: "https://gw/hook/x",
      secret: "s",
      key_prefix: "wh_1",
    };
    const { sdk, calls } = makeSdk(() => json(reveal));

    await expect(
      sdk.routines.mintRoutineWebhookKey("a1", "r1"),
    ).resolves.toEqual(reveal);
    // `/v1/agents/…`: the `/agents/…` prefix would be proxied to the pod, which
    // never serves webhook keys, and its 404 would read as "can't mint here".
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/agents/a1/routines/r1/webhook-key`,
        body: null,
      },
    ]);
  });

  it("percent-encodes every id it splices into a path", async () => {
    const { sdk, calls } = makeSdk(() => json(RUN));

    await sdk.routines.cancelRoutineRun("Home/Ada", "r 1/2", "run/3");
    expect(calls[0].url).toBe(
      `${BASE}/agents/Home%2FAda/routines/r%201%2F2/runs/run%2F3/cancel`,
    );
  });

  it("throws the module's error on a 404 — the mint never softens to null", async () => {
    const { sdk } = makeSdk(() => json({ error: "not found" }, 404));

    await expect(
      sdk.routines.mintRoutineWebhookKey("a1", "r1"),
    ).rejects.toBeInstanceOf(RoutinesHttpError);
    await expect(
      sdk.routines.mintRoutineWebhookKey("a1", "r1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("dispatches every routine command through the dispatch path", async () => {
    const { sdk, calls } = makeSdk((url) =>
      url.endsWith("/routines") ? json({ items: [ROUTINE] }) : json(ROUTINE),
    );

    await expect(
      sdk.dispatch({
        id: "1",
        type: RoutinesCommand.List,
        payload: { agentId: "a1" },
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      sdk.dispatch({
        id: "2",
        type: RoutinesCommand.Update,
        payload: { agentId: "a1", id: "r1", updates: { enabled: false } },
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(calls[1].body).toBe(JSON.stringify({ enabled: false }));
  });

  it("refuses a command payload that names no agent", async () => {
    const { sdk, calls } = makeSdk(() => json({ items: [] }));

    await expect(
      sdk.dispatch({ id: "1", type: RoutinesCommand.List, payload: {} }),
    ).resolves.toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("refuses a create whose routine has no name or prompt", async () => {
    const { sdk, calls } = makeSdk(() => json(ROUTINE));

    await expect(
      sdk.dispatch({
        id: "1",
        type: RoutinesCommand.Create,
        payload: { agentId: "a1", input: { name: "Daily" } },
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });
});
