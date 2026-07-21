import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { HoustonClient } from "../src/client.ts";
import type { CreatorProfile } from "../src/types.ts";

/**
 * Agent Store creator profile: the front-door `HoustonClient` methods that read
 * and mutate the caller's own profile, its handle claim + avatar, and per-day
 * install analytics against `/agentstore/me/*`. Each method asserts its exact
 * outgoing {method, url, body} — `getMyStoreProfile`/`updateMyStoreProfile`
 * unwrap the `{ profile }` envelope (and the getter tolerates a `null`), the
 * avatar upload rides a multipart body under field `file` (no `Content-Type`
 * set by the client), and analytics carries `days` only when supplied.
 *
 * A capturing `fetchImpl` records the outgoing request; JSON bodies are parsed,
 * a `FormData` body is kept raw (all requests are prefixed `${baseUrl}/v1`).
 */

interface Captured {
  method: string;
  url: string;
  body: unknown;
  form?: FormData;
}

function makeClient(response: { status?: number; body?: unknown } = {}): {
  client: HoustonClient;
  calls: Captured[];
} {
  const calls: Captured[] = [];
  const client = new HoustonClient({
    baseUrl: "http://127.0.0.1:9999",
    token: "tok",
    fetchImpl: async (url, init) => {
      const raw = init?.body;
      calls.push({
        method: init?.method ?? "GET",
        url: String(url),
        body: typeof raw === "string" ? JSON.parse(raw) : undefined,
        form: raw instanceof FormData ? raw : undefined,
      });
      const status = response.status ?? 200;
      if (status === 204) return new Response(null, { status });
      return new Response(JSON.stringify(response.body ?? {}), {
        status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, calls };
}

const BASE = "http://127.0.0.1:9999/v1/agentstore";

const profile: CreatorProfile = {
  handle: "felipe",
  displayName: "Felipe",
  bio: null,
  avatarUrl: null,
  verified: false,
  links: {},
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("HoustonClient — creator profile: getMyStoreProfile", () => {
  it("GETs /agentstore/me/profile and unwraps the profile", async () => {
    const { client, calls } = makeClient({ body: { profile } });
    const got = await client.getMyStoreProfile();
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, `${BASE}/me/profile`);
    deepStrictEqual(got, profile);
  });

  it("returns null when no profile has been materialized", async () => {
    const { client } = makeClient({ body: { profile: null } });
    strictEqual(await client.getMyStoreProfile(), null);
  });
});

describe("HoustonClient — creator profile: updateMyStoreProfile", () => {
  it("PATCHes the patch to /me/profile and unwraps the profile", async () => {
    const { client, calls } = makeClient({ body: { profile } });
    const got = await client.updateMyStoreProfile({
      handle: "felipe",
      displayName: "Felipe",
    });
    strictEqual(calls[0].method, "PATCH");
    strictEqual(calls[0].url, `${BASE}/me/profile`);
    deepStrictEqual(calls[0].body, { handle: "felipe", displayName: "Felipe" });
    deepStrictEqual(got, profile);
  });
});

describe("HoustonClient — creator profile: checkStoreHandle", () => {
  it("GETs /handles/{handle}/available, encoding the handle", async () => {
    const { client, calls } = makeClient({
      body: { available: false, reason: "reserved" },
    });
    const res = await client.checkStoreHandle("admin");
    strictEqual(calls[0].method, "GET");
    strictEqual(calls[0].url, `${BASE}/handles/admin/available`);
    deepStrictEqual(res, { available: false, reason: "reserved" });
  });
});

describe("HoustonClient — creator profile: avatar", () => {
  it("POSTs /me/avatar as multipart with the blob under field 'file'", async () => {
    const { client, calls } = makeClient({
      body: { avatarUrl: "https://cdn/x.webp" },
    });
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
    const res = await client.uploadStoreAvatar(blob);
    strictEqual(calls[0].method, "POST");
    strictEqual(calls[0].url, `${BASE}/me/avatar`);
    ok(calls[0].form instanceof FormData);
    ok(calls[0].form?.get("file") instanceof Blob);
    deepStrictEqual(res, { avatarUrl: "https://cdn/x.webp" });
  });

  it("DELETEs /me/avatar with no body", async () => {
    const { client, calls } = makeClient({ status: 204 });
    await client.deleteStoreAvatar();
    strictEqual(calls[0].method, "DELETE");
    strictEqual(calls[0].url, `${BASE}/me/avatar`);
    strictEqual(calls[0].body, undefined);
  });
});

describe("HoustonClient — creator profile: getMyStoreAnalytics", () => {
  it("GETs /me/analytics?days when a window is given", async () => {
    const { client, calls } = makeClient({
      body: { rows: [], totals: { installs: 0 } },
    });
    await client.getMyStoreAnalytics(30);
    strictEqual(calls[0].url, `${BASE}/me/analytics?days=30`);
  });

  it("GETs /me/analytics with no query when days is omitted", async () => {
    const { client, calls } = makeClient({
      body: { rows: [], totals: { installs: 0 } },
    });
    await client.getMyStoreAnalytics();
    strictEqual(calls[0].url, `${BASE}/me/analytics`);
  });
});
