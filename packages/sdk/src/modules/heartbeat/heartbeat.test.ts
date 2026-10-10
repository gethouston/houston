import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import {
  classifyHeartbeatFailure,
  HeartbeatCommand,
  HeartbeatHttpError,
} from "./index";

const BASE = "http://127.0.0.1:4318";
const STATE = { enabled: true, time: "08:00", last: null };

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("heartbeat module", () => {
  it("reads the settings with one GET", async () => {
    const { sdk, calls } = makeSdk(() => json(STATE));
    expect(await sdk.heartbeat.getHeartbeat()).toEqual(STATE);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/heartbeat`, body: null },
    ]);
  });

  it("writes exactly the fields it was given", async () => {
    const { sdk, calls } = makeSdk(() => json({ ...STATE, time: "07:00" }));
    await sdk.heartbeat.setHeartbeat({ time: "07:00" });
    expect(calls).toEqual([
      {
        method: "PUT",
        url: `${BASE}/v1/heartbeat`,
        body: JSON.stringify({ time: "07:00" }),
      },
    ]);
  });

  it("runs now with one POST", async () => {
    const { sdk, calls } = makeSdk(() => json({ status: "quiet" }));
    expect(await sdk.heartbeat.runHeartbeatNow()).toEqual({ status: "quiet" });
    expect(calls).toEqual([
      { method: "POST", url: `${BASE}/v1/heartbeat/run`, body: "{}" },
    ]);
  });

  it("dispatch validates the patch before it reaches the wire", async () => {
    const { sdk, calls } = makeSdk(() => json(STATE));
    const bad = await sdk.dispatch({
      id: "1",
      type: HeartbeatCommand.Set,
      payload: { time: "7am" },
    });
    expect(bad.ok).toBe(false);
    const good = await sdk.dispatch({
      id: "2",
      type: HeartbeatCommand.Set,
      payload: { enabled: false },
    });
    expect(good.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toBe(JSON.stringify({ enabled: false }));
  });

  it("a refusal throws the module's own error, carrying the status", async () => {
    const { sdk } = makeSdk(() =>
      json({ error: "mid-turn", code: "turn_running" }, 409),
    );
    const err = await sdk.heartbeat.runHeartbeatNow().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HeartbeatHttpError);
    expect((err as HeartbeatHttpError).status).toBe(409);
    expect(classifyHeartbeatFailure(err)).toEqual({ kind: "turn_running" });
  });
});

describe("classifyHeartbeatFailure", () => {
  const failure = (status: number, code?: string) =>
    new HeartbeatHttpError(JSON.stringify(code ? { code } : {}), status);

  it.each([
    [failure(422, "heartbeat_failed"), "failed"],
    [failure(501, "heartbeat_gateway_only"), "unavailable"],
    [failure(501, "heartbeat_unavailable"), "unavailable"],
    [failure(501), "unavailable"],
    [failure(500), "unexpected"],
    ["not an error", "unexpected"],
  ])("%s is %s", (error, kind) => {
    expect(classifyHeartbeatFailure(error).kind).toBe(kind);
  });

  it("reads the adapter's parsed body too", () => {
    const adapterError = Object.assign(new Error("x"), {
      status: 409,
      body: { code: "turn_running" },
    });
    expect(classifyHeartbeatFailure(adapterError)).toEqual({
      kind: "turn_running",
    });
  });
});
