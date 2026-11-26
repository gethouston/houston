import { describe, expect, it, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { memoryKv } from "../../test-ports";
import { moduleScope } from "../http";
import { ActivitiesHttpError } from "./http";
import { setMissionMode } from "./mission-mode";
import { toActivityItem } from "./view-model";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  path: string;
  body: string | null;
}

/** Bound like `renameMission`: `moduleScope` over a stub `fetch`. */
function makeScope(respond: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        path: new URL(String(input)).pathname,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond();
    },
  );
  const ports = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } satisfies SdkPorts;
  const scope = moduleScope(
    {
      config: { baseUrl: BASE, ports },
      authExpiry: { notifyExpired: vi.fn() },
    },
    "activities",
    ActivitiesHttpError,
  );
  return { scope, calls };
}

const card = (mode: string) =>
  new Response(
    JSON.stringify({ id: "m1", title: "T", status: "running", mode }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("setMissionMode — the conversation's kept mode", () => {
  it("PATCHes the mission with a body carrying only the mode", async () => {
    const { scope, calls } = makeScope(() => card("auto"));
    const kept = await setMissionMode(scope, "ag/1", "m/1", "auto");
    expect(calls).toEqual([
      {
        method: "PATCH",
        path: "/agents/ag%2F1/activities/m%2F1",
        body: '{"mode":"auto"}',
      },
    ]);
    expect(kept.mode).toBe("auto");
  });

  it("surfaces a refused write instead of swallowing it", async () => {
    const { scope } = makeScope(
      () =>
        new Response(JSON.stringify({ error: "invalid activity update" }), {
          status: 400,
        }),
    );
    await expect(
      setMissionMode(scope, "ag", "m1", "plan"),
    ).rejects.toBeInstanceOf(ActivitiesHttpError);
  });

  it("projects the kept mode onto the board view-model, and only when set", () => {
    const base = { id: "m1", title: "T", description: "", status: "done" };
    expect(toActivityItem({ ...base, mode: "plan" }).mode).toBe("plan");
    expect("mode" in toActivityItem(base)).toBe(false);
  });
});
