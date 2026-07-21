import { expect, test } from "vitest";
import { DEFAULT_RETRY_DELAYS_MS, fetchWithRetry } from "./retry";

test("waits the default 500ms/2000ms schedule between transient attempts", async () => {
  const waits: number[] = [];
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  };
  await expect(
    fetchWithRetry(fetchImpl, "https://store.test", undefined, {
      sleep: async (ms) => {
        waits.push(ms);
      },
    }),
  ).rejects.toThrow("fetch failed");
  expect(calls).toBe(3);
  expect(waits).toEqual(DEFAULT_RETRY_DELAYS_MS);
  expect(DEFAULT_RETRY_DELAYS_MS).toEqual([500, 2000]);
});

test("returns a transient status untouched on the final attempt", async () => {
  const waits: number[] = [];
  const fetchImpl: typeof fetch = async () =>
    new Response("still down", { status: 504 });
  const res = await fetchWithRetry(fetchImpl, "https://store.test", undefined, {
    delaysMs: [1, 2],
    sleep: async (ms) => {
      waits.push(ms);
    },
  });
  expect(res.status).toBe(504);
  expect(waits).toEqual([1, 2]);
});

test("an empty delay list disables retries entirely", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new TypeError("fetch failed");
  };
  await expect(
    fetchWithRetry(fetchImpl, "https://store.test", undefined, {
      delaysMs: [],
    }),
  ).rejects.toThrow("fetch failed");
  expect(calls).toBe(1);
});

test("the body factory is called once per attempt, so retries send a fresh body", async () => {
  const bodies: string[] = [];
  let calls = 0;
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body));
    calls += 1;
    return new Response(null, { status: calls < 3 ? 503 : 200 });
  }) as unknown as typeof fetch;
  let n = 0;
  const res = await fetchWithRetry(fetchImpl, "https://x.test/o", undefined, {
    delaysMs: [0, 0],
    sleep: async () => {},
    body: () => `body-${++n}`,
  });
  expect(res.status).toBe(200);
  expect(bodies).toEqual(["body-1", "body-2", "body-3"]);
});
