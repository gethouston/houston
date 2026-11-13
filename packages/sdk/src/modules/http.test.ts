import { describe, expect, it, vi } from "vitest";
import type { SdkPorts } from "../ports";
import { memoryKv } from "../test-ports";
import {
  COMPUTE_RETRY_BUDGET_MS,
  httpRequest,
  moduleScope,
  SdkHttpError,
} from "./http";

class TestHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "TestHttpError");
  }
}

/** A scope over scripted answers, with a clock that fires at once and records each pause. */
function makeScope(answers: Array<() => Response>) {
  const bodies: Array<string | null> = [];
  const pauses: number[] = [];
  const fetchImpl = vi.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(typeof init?.body === "string" ? init.body : null);
      const answer = answers[Math.min(bodies.length - 1, answers.length - 1)];
      return answer();
    },
  );
  const ports = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(),
    devicePreferences: memoryKv(),
    clock: {
      now: () => 0,
      setTimeout: (fn: () => void, ms: number) => {
        pauses.push(ms);
        queueMicrotask(fn);
        return 0;
      },
      clearTimeout: () => {},
    },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } satisfies SdkPorts;
  const scope = moduleScope(
    {
      config: { baseUrl: "http://host", ports },
      authExpiry: { notifyExpired: vi.fn() },
    },
    "test",
    TestHttpError,
  );
  return { scope, bodies, pauses };
}

const json =
  (status: number, body: unknown, headers?: Record<string, string>) => () =>
    new Response(JSON.stringify(body), { status, headers });

const busy = (retryAfterMs?: number) =>
  json(503, {
    error: "agent busy; retry in a moment",
    code: "compute_busy",
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });

describe("httpRequest: the gateway's nothing-ran refusals", () => {
  it("sends a compute_busy write again, the same request, until it lands", async () => {
    const { scope, bodies, pauses } = makeScope([
      busy(3_000),
      busy(3_000),
      json(201, { id: "r1" }),
    ]);

    const res = await httpRequest(scope, "/agents/a1/routines", {
      method: "POST",
      body: '{"name":"Daily"}',
    });

    expect(res.status).toBe(201);
    expect(bodies).toEqual([
      '{"name":"Daily"}',
      '{"name":"Daily"}',
      '{"name":"Daily"}',
    ]);
    expect(pauses).toEqual([3_000, 3_000]);
  });

  it("re-sends a pod_wake_refused answer on the Retry-After header", async () => {
    const { scope, pauses } = makeScope([
      json(
        503,
        { error: "engine unavailable", code: "pod_wake_refused" },
        { "Retry-After": "5" },
      ),
      json(200, { ok: true }),
    ]);

    const res = await httpRequest(scope, "/agents/a1/routines/r1", {
      method: "PATCH",
      body: "{}",
    });

    expect(res.status).toBe(200);
    expect(pauses).toEqual([5_000]);
  });

  it("gives up once its pauses would pass the budget, with the last refusal", async () => {
    const { scope, pauses } = makeScope([busy(7_000)]);

    const err = await httpRequest(scope, "/agents/a1/routines", {
      method: "POST",
      body: "{}",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TestHttpError);
    expect((err as TestHttpError).status).toBe(503);
    expect(pauses.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      COMPUTE_RETRY_BUDGET_MS,
    );
    expect(pauses).toEqual([7_000, 7_000]);
  });

  it("leaves a read's refusal to the transport's own ladder", async () => {
    const { scope, bodies } = makeScope([
      json(503, { error: "engine unavailable", code: "pod_wake_refused" }),
      json(200, {}),
    ]);

    await expect(
      httpRequest(scope, "/agents/a1/routines", { method: "GET" }),
    ).rejects.toBeInstanceOf(TestHttpError);
    expect(bodies).toHaveLength(1);
  });

  it("throws any other 503 at once, as before", async () => {
    const { scope, bodies } = makeScope([
      json(503, { error: "engine unavailable", detail: "agent is waking" }),
    ]);

    await expect(
      httpRequest(scope, "/agents/a1/routines", { method: "POST", body: "{}" }),
    ).rejects.toBeInstanceOf(TestHttpError);
    expect(bodies).toHaveLength(1);
  });

  it("never re-sends a body it cannot replay", async () => {
    const { scope, bodies } = makeScope([busy(), json(200, {})]);
    const stream = new ReadableStream<Uint8Array>();

    await expect(
      httpRequest(scope, "/agents/a1/files", { method: "POST", body: stream }),
    ).rejects.toBeInstanceOf(TestHttpError);
    expect(bodies).toHaveLength(1);
  });
});

describe("httpRequest upload body retry limit", () => {
  it.each([
    8 * 1024 * 1024,
    8 * 1024 * 1024 + 1,
  ])("sends a %i-byte body only when within the retry threshold", async (size) => {
    const { scope, bodies, pauses } = makeScope([busy(), json(200, {})]);
    const result = httpRequest(scope, "/agents/a1/attachments", {
      method: "POST",
      body: "x".repeat(size),
    });
    if (size > 8 * 1024 * 1024) {
      await expect(result).rejects.toMatchObject({ status: 503 });
      expect(bodies).toHaveLength(1);
      expect(pauses).toEqual([]);
    } else {
      await expect(result).resolves.toHaveProperty("status", 200);
      expect(bodies).toHaveLength(2);
      expect(pauses).toEqual([2000]);
    }
  });

  it("counts UTF-8 bytes rather than characters", async () => {
    const { scope, bodies } = makeScope([busy(), json(200, {})]);
    await expect(
      httpRequest(scope, "/agents/a1/attachments", {
        method: "POST",
        body: "é".repeat(4 * 1024 * 1024 + 1),
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(bodies).toHaveLength(1);
  });
});
