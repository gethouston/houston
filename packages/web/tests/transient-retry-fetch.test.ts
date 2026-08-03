import { afterEach, expect, test, vi } from "vitest";
import {
  classifyUnavailableBody,
  cpFetch,
  HANDOFF_RETRY_DELAYS_MS,
  retryDelaysFor,
  runtimeClientFor,
  setupRuntimeClientFor,
  transientRetryFetch,
  WAKE_RETRY_DELAYS_MS,
} from "../src/engine-adapter/control-plane";

/**
 * transientRetryFetch (HOU-731): reads bridge a rolling gateway deploy / pod
 * handoff (transient 5xx, network-level drops) with two brief blind retries,
 * so a history load hit mid-roll resolves instead of rendering an empty chat.
 * Writes never blind-retry.
 *
 * HOU-1153 makes that patience reason-aware: a 503 the gateway labels
 * "agent is waking" earns a cold-start budget (so a burst of chat-open reads
 * against a sleeping pod resolves instead of toasting), and a 503 that means
 * "this deployment doesn't run the feature" earns none.
 */
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
/** The gateway's exact wake answer (cloud/internal/edge/agents/routes.go). */
const wakingBody = { error: "engine unavailable", detail: "agent is waking" };

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
  // HOU-1153: the host answers probe routes 503 + Retry-After while the runtime
  // cold-boots, and the setup runtime is cold BY DEFINITION — first-run reaches
  // it before anything has ever run there. It was built on a bare auth fetch,
  // so that 503 surfaced as a hard failure while the identical probe against an
  // agent's runtime quietly retried.
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

// ── HOU-1153: the wake-transient 503 ────────────────────────────────────────

test("the gateway's 5xx vocabulary maps to typed reasons", () => {
  expect(classifyUnavailableBody(wakingBody)).toBe("engine-waking");
  expect(
    classifyUnavailableBody({ error: "shared skills not configured" }),
  ).toBe("feature-absent");
  // A wake-shaped error WITHOUT the waking detail is a real failure (the
  // gateway exhausted its 290s hold, or ensure-awake itself broke) — it keeps
  // the short handoff patience so the toast is not delayed by 15s.
  expect(
    classifyUnavailableBody({ error: "engine unavailable", detail: "boom" }),
  ).toBe("handoff");
  expect(classifyUnavailableBody({ error: "rolling" })).toBe("handoff");
  expect(classifyUnavailableBody(null)).toBe("handoff");

  expect(retryDelaysFor("engine-waking")).toBe(WAKE_RETRY_DELAYS_MS);
  expect(retryDelaysFor("handoff")).toBe(HANDOFF_RETRY_DELAYS_MS);
  expect(retryDelaysFor("feature-absent")).toEqual([]);
});

test("the wake budget is bounded to ~15s of client-side patience", () => {
  // Sized against the gateway's 8s ensure-awake leg + its Retry-After: 2.
  // Bounded on purpose — past this the honest answer is a toast, not a hang.
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
  // The old handoff budget spent all three of its attempts inside ~2s and gave
  // up; the wake schedule is still on its second attempt at that point.
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
  // The classifier read the 503 off a CLONE, so the resolved body is intact.
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
  // No silent failure: the exhausted budget hands the caller the real 503,
  // which cpFetch throws as a HoustonEngineError and the app toasts.
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
  // 500 is not in the transient set: one attempt, straight to the surface.
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

  // No fake timers: if this retried at all the test would hang on real sleeps.
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
