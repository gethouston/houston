import { afterEach, expect, test, vi } from "vitest";
import { httpSandboxFetch } from "./sandbox-fetch";

afterEach(() => vi.unstubAllGlobals());

test("httpSandboxFetch preserves the server-mode request and adds sandbox auth", async () => {
  const signal = new AbortController().signal;
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return new Response("ok");
    },
  );

  const call = httpSandboxFetch("https://host.test/", "sb-token");
  await call("/sandbox/example", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-houston-acting-as": "acting-v1.value",
    },
    body: '{"value":1}',
    signal,
  });

  expect(seen).toEqual([
    {
      url: "https://host.test/sandbox/example",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-houston-acting-as": "acting-v1.value",
          authorization: "Bearer sb-token",
        },
        body: '{"value":1}',
        signal,
      },
    },
  ]);
});
