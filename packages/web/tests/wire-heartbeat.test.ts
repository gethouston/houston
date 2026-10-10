import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWireCapture, json } from "./support/wire-capture";

/**
 * The AI Manager's morning briefing, as the open host (desktop, self-host)
 * receives it: `sdk.heartbeat` bound through the adapter's `viaSdk` seam.
 */

const BASE = "http://127.0.0.1:4318";
const { calls, reset, restore, stubFetch } = createWireCapture();
const state = { enabled: true, time: "07:30", last: null };

beforeEach(reset);
afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = () =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane: true });

const cases = [
  ["getHeartbeat", "GET", "/v1/heartbeat", null, state],
  [
    "setHeartbeat",
    "PUT",
    "/v1/heartbeat",
    JSON.stringify({ time: "07:30" }),
    state,
  ],
  ["runHeartbeatNow", "POST", "/v1/heartbeat/run", "{}", { status: "quiet" }],
] as const;

describe("morning briefing wire", () => {
  for (const [method, verb, path, body, response] of cases) {
    test(`${method} uses ${verb} ${path} with the exact body`, async () => {
      stubFetch(() => json(200, response));
      const value = client();
      const result =
        method === "setHeartbeat"
          ? await value.setHeartbeat({ time: "07:30" })
          : await value[method]();
      expect(result).toEqual(response);
      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(call).toMatchObject({ method: verb, url: `${BASE}${path}`, body });
      expect(call.headers.get("Authorization")).toBe("Bearer t");
      if (body !== null)
        expect(call.headers.get("Content-Type")).toBe("application/json");
    });
  }

  test("a malformed answer is refused, never rendered", async () => {
    stubFetch(() => json(200, { enabled: "yes" }));
    await expect(client().getHeartbeat()).rejects.toThrow(
      "Invalid heartbeat response",
    );
  });

  test("a refusal surfaces as the HoustonEngineError the app reads", async () => {
    stubFetch(() => json(409, { error: "mid-turn", code: "turn_running" }));
    const err = await client()
      .runHeartbeatNow()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(409);
    expect((err as HoustonEngineError).body).toMatchObject({
      code: "turn_running",
    });
  });
});
