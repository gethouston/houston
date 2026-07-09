import { afterEach, expect, test, vi } from "vitest";
import {
  runtimeClientFor,
  transientRetryFetch,
} from "../src/engine-adapter/control-plane";

/**
 * transientRetryFetch (HOU-731): reads bridge a rolling gateway deploy / pod
 * handoff (transient 5xx, network-level drops) with two brief blind retries,
 * so a history load hit mid-roll resolves instead of rendering an empty chat.
 * Writes never blind-retry.
 */

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
