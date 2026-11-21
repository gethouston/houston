import {
  HoustonClient,
  HoustonEngineError,
} from "@houston/engine-adapter/client";
import { afterEach, expect, test, vi } from "vitest";

const CFG = { baseUrl: "https://gw.example", token: "t", controlPlane: true };
const cp = () => new HoustonClient(CFG);

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
  billing: null,
};

test("acceptOrgInvite POSTs /v1/org-invites/:id/accept and unwraps {org}", async () => {
  const calls = stubFetch(201, { org: ORG });
  await expect(cp().acceptOrgInvite("inv-1")).resolves.toEqual(ORG);
  expect(calls).toEqual([
    { url: "https://gw.example/v1/org-invites/inv-1/accept", method: "POST" },
  ]);
});

test("acceptOrgInvite percent-encodes the invite id", async () => {
  const calls = stubFetch(201, { org: ORG });
  await cp().acceptOrgInvite("inv/1 2");
  expect(calls[0].url).toBe(
    "https://gw.example/v1/org-invites/inv%2F1%202/accept",
  );
});

test("acceptOrgInvite throws a 403 needs_upgrade instead of degrading", async () => {
  stubFetch(403, { error: "team needs upgrade", code: "needs_upgrade" });
  await expect(cp().acceptOrgInvite("inv-1")).rejects.toThrow(
    HoustonEngineError,
  );
});

test("acceptOrgInvite throws a 409 already_member and a 404 invite_not_found", async () => {
  stubFetch(409, { error: "already a member", code: "already_member" });
  await expect(cp().acceptOrgInvite("inv-1")).rejects.toThrow(
    HoustonEngineError,
  );
  stubFetch(404, { error: "invite not found", code: "invite_not_found" });
  await expect(cp().acceptOrgInvite("inv-1")).rejects.toThrow(
    HoustonEngineError,
  );
});

test("declineOrgInvite DELETEs /v1/org-invites/:id and resolves on 204", async () => {
  const calls = stubFetch(204, null);
  await expect(cp().declineOrgInvite("inv-2")).resolves.toBeUndefined();
  expect(calls).toEqual([
    { url: "https://gw.example/v1/org-invites/inv-2", method: "DELETE" },
  ]);
});

test("declineOrgInvite throws a 404 instead of degrading", async () => {
  stubFetch(404, { error: "invite not found", code: "invite_not_found" });
  await expect(cp().declineOrgInvite("inv-2")).rejects.toThrow(
    HoustonEngineError,
  );
});
