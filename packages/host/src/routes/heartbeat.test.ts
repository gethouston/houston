import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { HoustonEvent } from "@houston/protocol";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Workspace } from "../domain/types";
import type { HeartbeatOutcome } from "../heartbeat/runner";
import type { WorkspaceStore } from "../ports";
import { MemoryVfs } from "../vfs";
import {
  HEARTBEAT_PATH,
  HEARTBEAT_RUN_PATH,
  type HeartbeatRouteDeps,
  handleHeartbeat,
} from "./heartbeat";

const WS: Workspace = {
  id: "Personal",
  ownerUserId: "local-owner",
  kind: "personal",
  name: "Personal",
  slug: "Personal",
  runtime: "local",
  createdAt: 0,
};

let events: HoustonEvent[];
beforeEach(() => {
  events = [];
});

function deps(over: Partial<HeartbeatRouteDeps> = {}): HeartbeatRouteDeps {
  return {
    store: {
      getOrCreatePersonalWorkspace: async () => WS,
    } as unknown as WorkspaceStore,
    vfs: new MemoryVfs(),
    events: { emit: (_u, e) => events.push(e), subscribe: () => () => {} },
    heartbeat: {
      runNow: vi.fn(async (): Promise<HeartbeatOutcome> => ({ kind: "quiet" })),
    },
    ...over,
  };
}

async function call(
  d: HeartbeatRouteDeps,
  method: string,
  path: string,
  body?: string,
) {
  const out: { status?: number; body?: unknown } = {};
  const req = Readable.from(
    body ? [Buffer.from(body)] : [],
  ) as unknown as IncomingMessage;
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(buf?: Buffer | string) {
      const text = buf?.toString() ?? "";
      out.body = text ? JSON.parse(text) : undefined;
    },
  } as unknown as ServerResponse;
  expect(await handleHeartbeat(d, "local-owner", method, path, req, res)).toBe(
    true,
  );
  return out;
}

describe("GET /v1/heartbeat", () => {
  test("answers the defaults before anything was saved", async () => {
    expect(await call(deps(), "GET", HEARTBEAT_PATH)).toEqual({
      status: 200,
      body: { enabled: true, time: "08:00", last: null },
    });
  });
});

describe("PUT /v1/heartbeat", () => {
  test("applies a partial change, keeps the rest, and announces it", async () => {
    const d = deps();
    const res = await call(
      d,
      "PUT",
      HEARTBEAT_PATH,
      JSON.stringify({ time: "07:00" }),
    );
    expect(res).toEqual({
      status: 200,
      body: { enabled: true, time: "07:00", last: null },
    });
    expect((await call(d, "GET", HEARTBEAT_PATH)).body).toMatchObject({
      time: "07:00",
    });
    expect(events).toEqual([
      { type: "HeartbeatChanged", workspaceId: "Personal" },
    ]);
  });

  test.each([
    JSON.stringify({ time: "25:00" }),
    JSON.stringify({ enabled: "no" }),
    JSON.stringify({ time: "07:00", other: true }),
    "not json",
  ])("refuses %s with a code", async (body) => {
    const res = await call(deps(), "PUT", HEARTBEAT_PATH, body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "heartbeat_invalid" });
  });
});

describe("POST /v1/heartbeat/run", () => {
  test.each([
    [{ kind: "delivered" }, 200, { status: "delivered" }],
    [{ kind: "quiet" }, 200, { status: "quiet" }],
    [{ kind: "busy" }, 409, { code: "turn_running" }],
    [
      { kind: "error", reason: "no provider" },
      422,
      { code: "heartbeat_failed", error: "no provider" },
    ],
  ] as const)("%j answers %i", async (outcome, status, body) => {
    const d = deps({ heartbeat: { runNow: async () => outcome } });
    const res = await call(d, "POST", HEARTBEAT_RUN_PATH);
    expect(res.status).toBe(status);
    expect(res.body).toMatchObject(body);
  });

  test("a host with no runner says so", async () => {
    const res = await call(
      deps({ heartbeat: undefined }),
      "POST",
      HEARTBEAT_RUN_PATH,
    );
    expect(res).toMatchObject({
      status: 501,
      body: { code: "heartbeat_unavailable" },
    });
  });
});

describe("refusals", () => {
  test("a gateway-fronted host answers 501 on every route", async () => {
    const d = deps({ gatewayFronted: true });
    for (const [method, path] of [
      ["GET", HEARTBEAT_PATH],
      ["PUT", HEARTBEAT_PATH],
      ["POST", HEARTBEAT_RUN_PATH],
    ] as const) {
      const res = await call(d, method, path, "{}");
      expect(res).toMatchObject({
        status: 501,
        body: { code: "heartbeat_gateway_only" },
      });
    }
  });

  test("a wrong method is a coded 405", async () => {
    const res = await call(deps(), "DELETE", HEARTBEAT_PATH);
    expect(res).toMatchObject({
      status: 405,
      body: { code: "method_not_allowed" },
    });
  });

  test("other paths are declined", async () => {
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    const req = Readable.from([]) as unknown as IncomingMessage;
    expect(
      await handleHeartbeat(deps(), "u", "GET", "/v1/other", req, res),
    ).toBe(false);
  });
});
