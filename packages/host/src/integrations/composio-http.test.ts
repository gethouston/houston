import { expect, test } from "vitest";
import { ComposioHttp } from "./composio-http";

function flakyFetch(failures: unknown[]) {
  const calls: string[] = [];
  const impl = (async (_url: string, init?: RequestInit) => {
    calls.push(init?.method ?? "GET");
    const next = failures.shift();
    if (next !== undefined) throw next;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const reset = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
  });
const closed = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("other side closed"), {
      code: "UND_ERR_SOCKET",
    }),
  });

test.each([
  ["a reset", reset],
  ["a closed socket", closed],
  [
    "Bun's bare reset",
    () => Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
  ],
])("a GET dropped by %s is sent once more", async (_name, fail) => {
  const { impl, calls } = flakyFetch([fail()]);
  const http = new ComposioHttp("k", "https://composio.test", impl);
  await expect(http.call("/api/v3/toolkits")).resolves.toEqual({ ok: true });
  expect(calls).toEqual(["GET", "GET"]);
});

test("a second drop is the caller's to see", async () => {
  const { impl, calls } = flakyFetch([reset(), reset()]);
  const http = new ComposioHttp("k", "https://composio.test", impl);
  await expect(http.call("/api/v3/toolkits")).rejects.toThrow("fetch failed");
  expect(calls).toEqual(["GET", "GET"]);
});

test("a write is never resent: the first attempt may have landed", async () => {
  const { impl, calls } = flakyFetch([reset()]);
  const http = new ComposioHttp("k", "https://composio.test", impl);
  await expect(
    http.call("/api/v3/auth_configs", { method: "POST", body: {} }),
  ).rejects.toThrow("fetch failed");
  expect(calls).toEqual(["POST"]);
});

test.each([
  ["DNS failure", "ENOTFOUND"],
  ["a refused connection", "ECONNREFUSED"],
])("%s is not resent", async (_name, code) => {
  const err = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error(code), { code }),
  });
  const { impl, calls } = flakyFetch([err]);
  const http = new ComposioHttp("k", "https://composio.test", impl);
  await expect(http.call("/api/v3/toolkits")).rejects.toThrow("fetch failed");
  expect(calls).toEqual(["GET"]);
});
