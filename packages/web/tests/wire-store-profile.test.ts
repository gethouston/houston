import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The Agent Store creator-profile and owner READS the app drives itself, pinned
 * at the HTTP level: `getMyStoreProfile` / `updateMyStoreProfile` /
 * `listMyStoreAgents`. They do NOT ride the engine's control-plane fetch — they
 * go through `AgentStoreClient` over the `storeAuthFetch` seam
 * (`@houston/engine-adapter`, `src/store-gateway.ts`), so nothing in the `cp/*` wire specs
 * would notice one of them drifting.
 *
 * The store routes are USER-scoped, never space-scoped, so the header contract
 * here is deliberately the inverse of every other `wire-*` spec: the session
 * bearer must be present and `x-houston-org` must be ABSENT, even with a space
 * pinned. Sending the space header would scope a creator's own profile to
 * whichever team they happened to have open.
 */

const BASE = "http://host";
const STORE = `${BASE}/v1/agentstore`;

const { calls, reset, restore, stubResponses: stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const client = (controlPlane = true) =>
  new HoustonClient({ baseUrl: BASE, token: "t", controlPlane });

const PROFILE = {
  handle: "felipe",
  displayName: "Felipe",
  bio: null,
  avatarUrl: null,
  verified: false,
  links: {},
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

// ---- getMyStoreProfile ----

test("getMyStoreProfile GETs /agentstore/me/profile and unwraps the envelope", async () => {
  stubFetch(json(200, { profile: PROFILE }));

  await expect(client().getMyStoreProfile()).resolves.toEqual(PROFILE);

  expect(calls).toHaveLength(1);
  const [get] = calls;
  expect(get.method).toBe("GET");
  expect(get.url).toBe(`${STORE}/me/profile`);
  expect(get.body).toBeNull();
  expect(get.headers.get("Authorization")).toBe("Bearer t");
});

test("getMyStoreProfile answers null when no profile was ever materialized", async () => {
  // `null` is the gateway's real answer for "you have never published", not an
  // error: the app renders the claim-a-handle empty state off it.
  stubFetch(json(200, { profile: null }));

  await expect(client().getMyStoreProfile()).resolves.toBeNull();
});

// ---- updateMyStoreProfile ----

test("updateMyStoreProfile PATCHes the patch verbatim and unwraps the envelope", async () => {
  stubFetch(json(200, { profile: PROFILE }));

  await expect(
    client().updateMyStoreProfile({ handle: "felipe", displayName: "Felipe" }),
  ).resolves.toEqual(PROFILE);

  expect(calls).toHaveLength(1);
  const [patch] = calls;
  expect(patch.method).toBe("PATCH");
  expect(patch.url).toBe(`${STORE}/me/profile`);
  expect(patch.body).toBe(
    JSON.stringify({ handle: "felipe", displayName: "Felipe" }),
  );
  expect(patch.headers.get("content-type")).toBe("application/json");
  expect(patch.headers.get("Authorization")).toBe("Bearer t");
});

// ---- the store-owner read ----

test("listMyStoreAgents GETs /agentstore/me/agents and unwraps items", async () => {
  const items = [
    { id: "a1", name: "Alpha", skills: ["inbox"] },
    { id: "a2", name: "Beta" },
  ];
  stubFetch(json(200, { items }));

  // `skills` is backfilled to `[]` rather than left undefined — the owner panel
  // maps over it.
  await expect(client().listMyStoreAgents()).resolves.toEqual([
    { id: "a1", name: "Alpha", skills: ["inbox"] },
    { id: "a2", name: "Beta", skills: [] },
  ]);

  expect(calls).toHaveLength(1);
  expect(calls[0].method).toBe("GET");
  expect(calls[0].url).toBe(`${STORE}/me/agents`);
});

// ---- the header contract ----

test("the store routes never carry x-houston-org, even with a space pinned", async () => {
  stubFetch(json(200, { profile: PROFILE }), json(200, { profile: PROFILE }));
  const c = client();
  c.setActiveOrg(ORG);

  await c.getMyStoreProfile();
  await c.updateMyStoreProfile({ displayName: "Felipe" });

  expect(calls).toHaveLength(2);
  for (const call of calls) {
    expect(call.headers.get("x-houston-org")).toBeNull();
    expect(call.headers.get("Authorization")).toBe("Bearer t");
  }
});

// ---- failures reach the caller ----

test("a failed profile read surfaces the gateway status — never swallowed", async () => {
  stubFetch(json(500, { error: "boom" }));

  await expect(client().getMyStoreProfile()).rejects.toMatchObject({
    status: 500,
  });
});

test("the profile calls refuse without a connected host", async () => {
  const c = client(false);

  await expect(c.getMyStoreProfile()).rejects.toThrow(
    "Your creator profile needs a connected host.",
  );
  await expect(c.updateMyStoreProfile({ displayName: "x" })).rejects.toThrow(
    "Your creator profile needs a connected host.",
  );
  expect(calls).toHaveLength(0);
});
