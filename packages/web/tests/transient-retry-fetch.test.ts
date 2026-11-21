import {
  classifyUnavailableBody,
  cpFetch,
  HANDOFF_RETRY_DELAYS_MS,
  retryDelaysFor,
  runtimeClientFor,
  setupRuntimeClientFor,
  transientRetryFetch,
  WAKE_RETRY_DELAYS_MS,
} from "@houston/engine-adapter/control-plane";
import { afterEach, expect, test, vi } from "vitest";

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const wakingBody = { error: "engine unavailable", detail: "agent is waking" };
const proxyFailedBody = {
  error: "engine proxy failed",
  detail:
    'Get "http://10.0.0.7:4318/skills": dial tcp 10.0.0.7:4318: connect: connection refused',
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("a GET rides through transient 503s and resolves", async () => {
  vi.useFakeTimers();
  const inner = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json(503, { error: "rolling" }))
    .mockResolvedValueOnce(json(503, { error: "rolling" }))
    .mockResolvedValueOnce(json(200, { ok: true }));
  const doFetch = transientRetryFetch(inner);

  const pending = doFetch("https://gw.example/x");
  await vi.advanceTimersByTimeAsync(500 + 1500);
  const res = await pending;
  expect(res.status).toBe(200);
  expect(inner).toHaveBeenCalledTimes(3);
});

test("a GET that keeps failing surfaces the last transient answer", async () => {
  vi.useFakeTimers();
  const inner = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json(503, { error: "down" }));
  const doFetch = transientRetryFetch(inner);

  const pending = doFetch("https://gw.example/x");
  await vi.advanceTimersByTimeAsync(500 + 1500);
  const res = await pending;
  expect(res.status).toBe(503);
  expect(inner).toHaveBeenCalledTimes(3);
});

test("a network-level drop on a GET retries and can recover", async () => {
  vi.useFakeTimers();
  const inner = vi
    .fn<typeof fetch>()
    .mockRejectedValueOnce(new TypeError("connection reset"))
    .mockResolvedValueOnce(json(200, { ok: true }));
  const doFetch = transientRetryFetch(inner);

  const pending = doFetch("https://gw.example/x");
  await vi.advanceTimersByTimeAsync(500);
  const res = await pending;
  expect(res.status).toBe(200);
  expect(inner).toHaveBeenCalledTimes(2);
});

test("a POST never blind-retries", async () => {
  const inner = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json(503, { error: "rolling" }));
  const doFetch = transientRetryFetch(inner);

  const res = await doFetch("https://gw.example/x", { method: "POST" });
  expect(res.status).toBe(503);
  expect(inner).toHaveBeenCalledTimes(1);
});

test("the SETUP runtime's provider probe bridges a cold-boot 503 too", async () => {
  vi.useFakeTimers();
  let calls = 0;
  globalThis.fetch = vi.fn(async () => {
    calls++;
    if (calls === 1) return json(503, { error: "runtime starting" });
    return json(200, [{ id: "anthropic", configured: false }]);
  }) as unknown as typeof fetch;

  const engine = setupRuntimeClientFor({
    baseUrl: "https://gw.example",
    token: "tok",
  });
  const pending = engine.listProviders();
  await vi.advanceTimersByTimeAsync(500);
  expect(await pending).toEqual([{ id: "anthropic", configured: false }]);
  expect(calls).toBe(2);
});

test("runtimeClientFor's history read bridges a transient 503", async () => {
  vi.useFakeTimers();
  let calls = 0;
  globalThis.fetch = vi.fn(async () => {
    calls++;
    if (calls === 1) return json(503, { error: "pod handoff" });
    return json(200, { id: "s1", title: "t", messages: [] });
  }) as unknown as typeof fetch;

  const engine = runtimeClientFor(
    { baseUrl: "https://gw.example", token: "tok" },
    "agent-1",
  );
  const pending = engine.getHistory("s1");
  await vi.advanceTimersByTimeAsync(500);
  const history = await pending;
  expect(history.messages).toEqual([]);
  expect(calls).toBe(2);
});

test("the gateway's 5xx vocabulary maps to typed reasons", () => {
  expect(classifyUnavailableBody(wakingBody)).toBe("engine-waking");
  expect(
    classifyUnavailableBody({ error: "shared skills not configured" }),
  ).toBe("feature-absent");
  expect(classifyUnavailableBody({ error: "rolling" })).toBe("handoff");
  expect(classifyUnavailableBody(null)).toBe("handoff");

  expect(retryDelaysFor("engine-waking")).toBe(WAKE_RETRY_DELAYS_MS);
  expect(retryDelaysFor("handoff")).toBe(HANDOFF_RETRY_DELAYS_MS);
  expect(retryDelaysFor("feature-absent")).toEqual([]);
});

test("the host's probe-route 'runtime is still starting' 503 earns the wake budget", () => {
  expect(
    classifyUnavailableBody({
      error: "the agent's runtime is still starting, try again shortly",
    }),
  ).toBe("engine-waking");
  expect(
    classifyUnavailableBody({ error: "the agent's runtime is starting" }),
  ).toBe("handoff");
});

test("the host's 'shutting down' 503 earns the wake budget", () => {
  expect(
    classifyUnavailableBody({
      error: "the host is shutting down; retry shortly",
    }),
  ).toBe("engine-waking");
  expect(
    classifyUnavailableBody({
      error: "engine unavailable",
      detail: "the host is shutting down; retry shortly",
    }),
  ).toBe("engine-waking");
  expect(classifyUnavailableBody({ error: "the host is shutting down" })).toBe(
    "handoff",
  );
});

test("the proxy's engine-proxy-failed 502 is a pod-unreachable read, with the wake budget", () => {
  expect(classifyUnavailableBody(proxyFailedBody)).toBe("pod-unreachable");
  expect(classifyUnavailableBody({ error: "engine proxy failed" })).toBe(
    "pod-unreachable",
  );
  expect(retryDelaysFor("pod-unreachable")).toBe(WAKE_RETRY_DELAYS_MS);
  expect(classifyUnavailableBody({ error: "agent pod unusable" })).toBe(
    "handoff",
  );
});

test("a read against a pod restarting under a roll rides the 502s and resolves", async () => {
  vi.useFakeTimers();
  const inner = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json(502, proxyFailedBody))
    .mockResolvedValueOnce(json(502, proxyFailedBody))
    .mockResolvedValueOnce(json(502, proxyFailedBody))
    .mockResolvedValueOnce(json(200, [{ name: "write-a-post" }]));
  const doFetch = transientRetryFetch(inner);

  const pending = doFetch("https://gw.example/agents/a1/skills");
  await vi.advanceTimersByTimeAsync(sum(HANDOFF_RETRY_DELAYS_MS));
  expect(inner).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(sum(WAKE_RETRY_DELAYS_MS));
  const res = await pending;
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([{ name: "write-a-post" }]);
  expect(inner).toHaveBeenCalledTimes(4);
});

test("cpFetch throws the proxy's reason once the pod-unreachable budget is spent", async () => {
  vi.useFakeTimers();
  globalThis.fetch = vi.fn(async () =>
    json(502, proxyFailedBody),
  ) as unknown as typeof fetch;

  const pending = cpFetch(
    { baseUrl: "https://gw.example", token: "tok" },
    "/agents/a1/skills",
  ).catch((err: unknown) => err);
  await vi.advanceTimersByTimeAsync(sum(WAKE_RETRY_DELAYS_MS));
  const err = (await pending) as { status: number; message: string };
  expect(err.status).toBe(502);
  expect(err.message).toBe("engine proxy failed (engine error 502)");
  expect(globalThis.fetch).toHaveBeenCalledTimes(
    WAKE_RETRY_DELAYS_MS.length + 1,
  );
});

test("the wake budget is bounded to ~15s of client-side patience", () => {
  expect(sum(WAKE_RETRY_DELAYS_MS)).toBe(15_000);
  expect(sum(WAKE_RETRY_DELAYS_MS)).toBeLessThanOrEqual(20_000);
});

test("a read against a waking pod retries past the handoff budget and resolves", async () => {
  vi.useFakeTimers();
  const inner = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(json(503, wakingBody))
    .mockResolvedValueOnce(json(503, wakingBody))
    .mockResolvedValueOnce(json(503, wakingBody))
    .mockResolvedValueOnce(json(200, { content: "board" }));
  const doFetch = transientRetryFetch(inner);

  const pending = doFetch("https://gw.example/agents/a1/agentfile/board.json");
  await vi.advanceTimersByTimeAsync(sum(HANDOFF_RETRY_DELAYS_MS));
  expect(inner).toHaveBeenCalledTimes(2);

  await vi.advanceTimersByTimeAsync(sum(WAKE_RETRY_DELAYS_MS));
  const res = await pending;
  expect(res.status).toBe(200);
  expect(inner).toHaveBeenCalledTimes(4);
});

test("cpFetch resolves a waking read to its body — no error to toast", async () => {
  vi.useFakeTimers();
  let calls = 0;
  globalThis.fetch = vi.fn(async () => {
    calls++;
    return calls === 1 ? json(503, wakingBody) : json(200, { items: [] });
  }) as unknown as typeof fetch;

  const pending = cpFetch(
    { baseUrl: "https://gw.example", token: "tok" },
    "/agents/a1/routines",
  );
  await vi.advanceTimersByTimeAsync(WAKE_RETRY_DELAYS_MS[0]);
  const res = await pending;
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ items: [] });
  expect(calls).toBe(2);
});

test("a pod that never wakes surfaces the 503 once the budget is spent", async () => {
  vi.useFakeTimers();
  const inner = vi.fn<typeof fetch>().mockResolvedValue(json(503, wakingBody));
  const doFetch = transientRetryFetch(inner);

  const pending = doFetch("https://gw.example/agents/a1/routines");
  await vi.advanceTimersByTimeAsync(sum(WAKE_RETRY_DELAYS_MS));
  const res = await pending;
  expect(res.status).toBe(503);
  expect(inner).toHaveBeenCalledTimes(WAKE_RETRY_DELAYS_MS.length + 1);
});

test("cpFetch throws the gateway's reason once the wake budget is spent", async () => {
  vi.useFakeTimers();
  globalThis.fetch = vi.fn(async () =>
    json(503, wakingBody),
  ) as unknown as typeof fetch;

  const pending = cpFetch(
    { baseUrl: "https://gw.example", token: "tok" },
    "/agents/a1/routines",
  ).catch((err: unknown) => err);
  await vi.advanceTimersByTimeAsync(sum(WAKE_RETRY_DELAYS_MS));
  const err = (await pending) as { status: number; message: string };
  expect(err.status).toBe(503);
  expect(err.message).toContain("engine unavailable");
});

test("a non-503 error never retries — it toasts immediately", async () => {
  const inner = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json(500, { error: "boom" }));
  const doFetch = transientRetryFetch(inner);
  expect((await doFetch("https://gw.example/x")).status).toBe(500);
  expect(inner).toHaveBeenCalledTimes(1);

  const notFound = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json(404, { error: "agent not found" }));
  expect(
    (await transientRetryFetch(notFound)("https://gw.example/x")).status,
  ).toBe(404);
  expect(notFound).toHaveBeenCalledTimes(1);
});

test("a feature this deployment doesn't run is answered without retrying", async () => {
  const inner = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json(503, { error: "shared skills not configured" }));
  const doFetch = transientRetryFetch(inner);

  const res = await doFetch("https://gw.example/v1/workspaces/w/shared-skills");
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "shared skills not configured" });
  expect(inner).toHaveBeenCalledTimes(1);
});

test("a POST against a waking pod still never blind-retries", async () => {
  const inner = vi.fn<typeof fetch>().mockResolvedValue(json(503, wakingBody));
  const res = await transientRetryFetch(inner)("https://gw.example/x", {
    method: "POST",
  });
  expect(res.status).toBe(503);
  expect(inner).toHaveBeenCalledTimes(1);
});

test("'engine unavailable' is the gateway's transient bucket, whatever the detail", () => {
  for (const detail of [
    "agent is waking",
    "assistant provisioning unavailable",
    "assistant pod is being torn down; retry",
    "assistant credential unavailable",
    "provisioning",
  ]) {
    expect(
      classifyUnavailableBody({ error: "engine unavailable", detail }),
    ).toBe("engine-waking");
  }
  expect(classifyUnavailableBody({ error: "engine unavailable" })).toBe(
    "engine-waking",
  );
});

test("a 'not_configured' code is a deployment shape, and is never retried", () => {
  expect(
    classifyUnavailableBody({
      error: "assistant not configured",
      code: "not_configured",
    }),
  ).toBe("feature-absent");
  expect(
    classifyUnavailableBody({
      error: "certificates off",
      code: "not_configured",
    }),
  ).toBe("feature-absent");
  expect(retryDelaysFor("feature-absent")).toEqual([]);
});
