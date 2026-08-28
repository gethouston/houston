import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";

/**
 * PRODUCT-1564: the language pick must actually land on the host. The host's
 * workspace-settings route is `PATCH /v1/workspaces/:id` (locale is the one
 * mutable field); the client used to PATCH a `/locale` suffix that no host
 * serves, so the pick 404'd and the language reverted on the next boot. A
 * capturing `fetchImpl` pins the exact wire request.
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
}

function makeClient(responseBody: unknown = {}): {
  client: HoustonClient;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:9999",
    token: "tok",
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, deadlineMs: 50 },
    fetchImpl: async (url, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      });
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const WS = {
  id: "ws-1",
  name: "Houston",
  isDefault: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  locale: "es",
};

describe("HoustonClient — setWorkspaceLocale", () => {
  it("PATCHes /workspaces/:id (the route the host serves) with {locale}", async () => {
    const { client, calls } = makeClient(WS);
    const got = await client.setWorkspaceLocale("ws-1", "es");
    strictEqual(calls.length, 1);
    strictEqual(calls[0].method, "PATCH");
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/workspaces/ws-1");
    deepStrictEqual(calls[0].body, { locale: "es" });
    deepStrictEqual(got, WS);
  });

  it("clears the override with an explicit null", async () => {
    const { client, calls } = makeClient({ ...WS, locale: null });
    await client.setWorkspaceLocale("ws-1", null);
    strictEqual(calls[0].url, "http://127.0.0.1:9999/v1/workspaces/ws-1");
    deepStrictEqual(calls[0].body, { locale: null });
  });
});
