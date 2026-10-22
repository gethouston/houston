import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { OrgCommand, OrgHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

/** An inert SDK over a mock `fetch` that records each URL + method. */
function makeSdk(respond: () => Response) {
  const calls: { method: string; url: string }[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
      });
      return respond();
    },
  );
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(new Map()),
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

const ROUTINES = {
  routines: [
    {
      routineId: "daily",
      name: "Daily summary",
      agentSlug: "0123456789abcdef",
      agentName: "Sales",
      kind: "schedule",
      enabled: true,
    },
    {
      routineId: "inbox",
      name: "",
      agentSlug: "0123456789abcdef",
      agentName: "Sales",
      kind: "trigger",
      enabled: false,
    },
  ],
};

describe("org module — what removing a member stops", () => {
  it("reads the member's routines off an escaped member address", async () => {
    const { sdk, calls } = makeSdk(() => json(ROUTINES));

    await expect(sdk.org.listMemberRoutines("u/1")).resolves.toEqual(ROUTINES);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/org/members/u%2F1/routines` },
    ]);
  });

  it("throws the gateway's refusal with its status", async () => {
    const { sdk } = makeSdk(() => json({ error: "not allowed" }, 403));

    const err = await sdk.org.listMemberRoutines("u1").catch((e) => e);
    expect(err).toBeInstanceOf(OrgHttpError);
    expect((err as OrgHttpError).status).toBe(403);
  });

  it("throws on an answer that is not the routines list", async () => {
    const { sdk } = makeSdk(() =>
      json({ routines: [{ routineId: "x", kind: "cron" }] }),
    );

    await expect(sdk.org.listMemberRoutines("u1")).rejects.toThrow();
  });

  it("dispatches the same read the facade makes", async () => {
    const { sdk, calls } = makeSdk(() => json(ROUTINES));

    const result = await sdk.dispatch({
      id: "1",
      type: OrgCommand.MemberRoutines,
      payload: { userId: "u1" },
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/org/members/u1/routines` },
    ]);
  });
});
