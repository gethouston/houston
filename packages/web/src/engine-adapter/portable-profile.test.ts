import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type {
  CreatorProfile,
  HandleAvailability,
} from "../../../../ui/engine-client/src/types";
import { HoustonEngineError } from "./client";
import type { ControlPlaneConfig } from "./control-plane";
import {
  checkStoreHandle,
  deleteStoreAvatar,
  getMyStoreAnalytics,
  getMyStoreProfile,
  updateMyStoreProfile,
  uploadStoreAvatar,
} from "./portable-profile";

/**
 * The creator-profile flow in the web adapter, driven with a fake `fetch` that
 * routes by URL path. In Node (no `window`) the gateway `me/*` routes resolve
 * against `cfg.baseUrl`. Asserts each method hits its `/v1/agentstore/me/*`
 * route with the right method/body, that the `{ profile }` envelope is unwrapped
 * (and `null` tolerated), that the avatar upload passes a multipart body
 * through, and that a gateway HTTP failure re-maps to a `HoustonEngineError`.
 */

const cfg: ControlPlaneConfig = { baseUrl: "http://host", token: "tok" };

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

interface Call {
  url: string;
  method: string;
  json: unknown;
  form?: FormData;
}
let calls: Call[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const raw = init?.body;
      calls.push({
        url,
        method,
        json: typeof raw === "string" ? JSON.parse(raw) : undefined,
        form: raw instanceof FormData ? raw : undefined,
      });

      if (url.endsWith("/v1/agentstore/me/profile")) {
        return jsonResponse({ profile });
      }
      if (url.includes("/v1/agentstore/handles/")) {
        return jsonResponse({
          available: false,
          reason: "taken",
        } satisfies HandleAvailability);
      }
      if (url.endsWith("/v1/agentstore/me/avatar")) {
        if (method === "DELETE") return new Response(null, { status: 204 });
        return jsonResponse({ avatarUrl: "https://cdn/x.webp" });
      }
      if (url.includes("/v1/agentstore/me/analytics")) {
        return jsonResponse({ rows: [], totals: { installs: 0 } });
      }
      return jsonResponse({ error: "unexpected" }, 500);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("getMyStoreProfile GETs /me/profile and unwraps the profile", async () => {
  const got = await getMyStoreProfile(cfg);
  expect(got).toEqual(profile);
  expect(calls[0].method).toBe("GET");
  expect(calls[0].url).toBe("http://host/v1/agentstore/me/profile");
});

test("getMyStoreProfile returns null when no profile is materialized", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ profile: null })),
  );
  expect(await getMyStoreProfile(cfg)).toBeNull();
});

test("updateMyStoreProfile PATCHes the patch and unwraps the profile", async () => {
  const got = await updateMyStoreProfile(cfg, { handle: "felipe" });
  expect(got).toEqual(profile);
  expect(calls[0].method).toBe("PATCH");
  expect(calls[0].url).toBe("http://host/v1/agentstore/me/profile");
  expect(calls[0].json).toEqual({ handle: "felipe" });
});

test("checkStoreHandle GETs /handles/{handle}/available", async () => {
  const res = await checkStoreHandle(cfg, "admin");
  expect(res).toEqual({ available: false, reason: "taken" });
  expect(calls[0].method).toBe("GET");
  expect(calls[0].url).toBe(
    "http://host/v1/agentstore/handles/admin/available",
  );
});

test("uploadStoreAvatar POSTs a multipart body with the blob under 'file'", async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });
  const res = await uploadStoreAvatar(cfg, blob);
  expect(res).toEqual({ avatarUrl: "https://cdn/x.webp" });
  expect(calls[0].method).toBe("POST");
  expect(calls[0].url).toBe("http://host/v1/agentstore/me/avatar");
  expect(calls[0].form).toBeInstanceOf(FormData);
  expect(calls[0].form?.get("file")).toBeInstanceOf(Blob);
});

test("deleteStoreAvatar DELETEs /me/avatar", async () => {
  await deleteStoreAvatar(cfg);
  expect(calls[0].method).toBe("DELETE");
  expect(calls[0].url).toBe("http://host/v1/agentstore/me/avatar");
});

test("getMyStoreAnalytics carries the days window", async () => {
  await getMyStoreAnalytics(cfg, 30);
  expect(calls[0].url).toContain("/v1/agentstore/me/analytics?days=30");
});

test("a gateway HTTP failure re-maps to a HoustonEngineError", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse({ error: "forbidden" }, 403)),
  );
  const err = await getMyStoreProfile(cfg).then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(HoustonEngineError);
  expect((err as HoustonEngineError).status).toBe(403);
});
