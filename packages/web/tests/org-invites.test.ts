import { afterEach, expect, test, vi } from "vitest";
import { HoustonEngineError } from "../src/engine-adapter/client";
import {
  acceptOrgInvite,
  declineOrgInvite,
} from "../src/engine-adapter/control-plane";

/**
 * The INVITEE half of C8 invites on the HOSTED path — the client every cloud
 * build actually runs. Two things have to hold and neither is free:
 *
 *  1. the routes are the CROSS-org `/v1/org-invites/*` pair, NOT the org-scoped
 *     `/v1/org/invites/:id` the owner's revoke uses. One stray slash and an
 *     invitee's Accept would hit the owner-only revoke route;
 *  2. accept UNWRAPS the gateway's `201 {org: OrgSummary}` envelope, so the
 *     caller can name the team it just joined.
 *
 * Neither call degrades: every rejection (`404 invite_not_found`,
 * `409 already_member`, `403 needs_upgrade`) is a state the invitee must see,
 * so it throws and the UI explains it. Mirrors `billing-degrade.test.ts`.
 */

const CFG = { baseUrl: "https://gw.example", token: "t" };

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

interface Call {
  url: string;
  method: string;
}

function stubFetch(status: number, body: unknown): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: status === 204 ? {} : { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return calls;
}

const ORG = {
  id: "o1",
  slug: "0123456789abcdef",
  name: "Acme",
  kind: "team",
  role: "user",
  memberCount: 4,
  degraded: false,
};

test("acceptOrgInvite POSTs /v1/org-invites/:id/accept and unwraps {org}", async () => {
  const calls = stubFetch(201, { org: ORG });
  await expect(acceptOrgInvite(CFG, "inv-1")).resolves.toEqual(ORG);
  expect(calls).toEqual([
    { url: "https://gw.example/v1/org-invites/inv-1/accept", method: "POST" },
  ]);
});

test("acceptOrgInvite percent-encodes the invite id", async () => {
  const calls = stubFetch(201, { org: ORG });
  await acceptOrgInvite(CFG, "inv/1 2");
  expect(calls[0].url).toBe(
    "https://gw.example/v1/org-invites/inv%2F1%202/accept",
  );
});

test("acceptOrgInvite throws a 403 needs_upgrade instead of degrading", async () => {
  stubFetch(403, { error: "team needs upgrade", code: "needs_upgrade" });
  await expect(acceptOrgInvite(CFG, "inv-1")).rejects.toThrow(
    HoustonEngineError,
  );
});

test("acceptOrgInvite throws a 409 already_member and a 404 invite_not_found", async () => {
  stubFetch(409, { error: "already a member", code: "already_member" });
  await expect(acceptOrgInvite(CFG, "inv-1")).rejects.toThrow(
    HoustonEngineError,
  );
  stubFetch(404, { error: "invite not found", code: "invite_not_found" });
  await expect(acceptOrgInvite(CFG, "inv-1")).rejects.toThrow(
    HoustonEngineError,
  );
});

test("declineOrgInvite DELETEs /v1/org-invites/:id and resolves on 204", async () => {
  const calls = stubFetch(204, null);
  await expect(declineOrgInvite(CFG, "inv-2")).resolves.toBeUndefined();
  expect(calls).toEqual([
    { url: "https://gw.example/v1/org-invites/inv-2", method: "DELETE" },
  ]);
});

test("declineOrgInvite throws a 404 instead of degrading", async () => {
  stubFetch(404, { error: "invite not found", code: "invite_not_found" });
  await expect(declineOrgInvite(CFG, "inv-2")).rejects.toThrow(
    HoustonEngineError,
  );
});
