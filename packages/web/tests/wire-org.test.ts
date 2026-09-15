import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  installLocalStorage,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * Org administration rides `sdk.org.*`.
 *
 * There is no second copy of these calls to diff against, so what the family
 * puts on the wire is pinned here literally — the whole
 * URL, the method, the body BYTES, and the three headers the gateway routes on
 * (`Content-Type`, `Authorization`, `x-houston-org`). A delegated call that
 * changes any of them changes what the hosted gateway does, and nothing else in
 * the suite would notice.
 *
 * The two degradations this family has stay in the MIXIN: the SDK throws on a
 * 404 (so iOS is never handed an empty roster it cannot tell from a real one)
 * and `getOrgProfiles`/`getOrgPeople` translate that status into the same empty
 * answers the cp copy returned.
 */

const BASE = "http://host";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  installLocalStorage();
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

/** What the gateway answers a successful member/invite mutation with. */
const noContent = (): Response => new Response(null, { status: 204 });

/** A hosted client with a team space pinned — every org call carries both. */
function client() {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

/** The one request the call issued, with the headers the gateway routes on. */
function onlyCall(): Call & { auth: string | null; org: string | null } {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  return {
    ...call,
    auth: call.headers.get("Authorization"),
    org: call.headers.get("x-houston-org"),
  };
}

describe("the delegated org reads", () => {
  test("getOrg asks GET /v1/org, authorized and space-scoped", async () => {
    stubFetch(() =>
      json(200, { id: "o1", slug: ORG, name: "A", role: "owner" }),
    );

    await expect(client().getOrg()).resolves.toEqual({
      id: "o1",
      slug: ORG,
      name: "A",
      role: "owner",
    });
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org`);
    expect(call.method).toBe("GET");
    expect(call.body).toBeNull();
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(call.auth).toBe("Bearer t");
    expect(call.org).toBe(ORG);
  });

  test("getOrgProfiles joins the ids into one escaped query value", async () => {
    stubFetch(() => json(200, { profiles: { u1: { displayName: "Ada" } } }));

    await expect(client().getOrgProfiles(["u1", "u 2/3"])).resolves.toEqual({
      profiles: { u1: { displayName: "Ada" } },
    });
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org/profiles?ids=u1%2Cu+2%2F3`);
    expect(call.method).toBe("GET");
    expect(call.org).toBe(ORG);
  });

  test("getOrgProfiles asks nothing at all for an empty id list", async () => {
    stubFetch(() => json(200, { profiles: {} }));

    await expect(client().getOrgProfiles([])).resolves.toEqual({
      profiles: {},
    });
    expect(calls).toEqual([]);
  });

  test("getOrgPeople asks GET /v1/org/people and unwraps the envelope", async () => {
    stubFetch(() => json(200, { people: [{ userId: "u1" }] }));

    await expect(client().getOrgPeople()).resolves.toEqual([{ userId: "u1" }]);
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org/people`);
    expect(call.method).toBe("GET");
    expect(call.org).toBe(ORG);
  });
});

describe("the delegated org writes", () => {
  test("addOrgMember POSTs exactly {email, role}", async () => {
    stubFetch(() => json(202, { role: "user", invited: true }));

    await expect(client().addOrgMember("ada@x.co", "user")).resolves.toEqual({
      role: "user",
      invited: true,
    });
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org/members`);
    expect(call.method).toBe("POST");
    expect(call.body).toBe(JSON.stringify({ email: "ada@x.co", role: "user" }));
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(call.auth).toBe("Bearer t");
    expect(call.org).toBe(ORG);
  });

  test("deleteOrgInvite DELETEs the escaped invite address, no body", async () => {
    stubFetch(noContent);

    await expect(client().deleteOrgInvite("inv/1 2")).resolves.toBeUndefined();
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org/invites/inv%2F1%202`);
    expect(call.method).toBe("DELETE");
    expect(call.body).toBeNull();
    expect(call.org).toBe(ORG);
  });

  test("removeOrgMember DELETEs the escaped member address, no body", async () => {
    stubFetch(noContent);

    await expect(client().removeOrgMember("u/1")).resolves.toBeUndefined();
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org/members/u%2F1`);
    expect(call.method).toBe("DELETE");
    expect(call.body).toBeNull();
  });

  test("setOrgMemberRole PATCHes exactly {role}", async () => {
    stubFetch(noContent);

    await expect(
      client().setOrgMemberRole("u/1", "admin"),
    ).resolves.toBeUndefined();
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org/members/u%2F1`);
    expect(call.method).toBe("PATCH");
    expect(call.body).toBe(JSON.stringify({ role: "admin" }));
    expect(call.headers.get("Content-Type")).toBe("application/json");
  });
});

describe("the delegated activity + usage reads", () => {
  test("orgAudit sends only the bounds the caller supplied", async () => {
    stubFetch(() => json(200, { entries: [] }));
    await client().orgAudit();
    expect(onlyCall().url).toBe(`${BASE}/v1/org/audit`);

    reset();
    await client().orgAudit({ limit: 50 });
    expect(onlyCall().url).toBe(`${BASE}/v1/org/audit?limit=50`);

    reset();
    await client().orgAudit({ before: 1700, limit: 50 });
    expect(onlyCall().url).toBe(`${BASE}/v1/org/audit?before=1700&limit=50`);
  });

  test("orgAudit unwraps the entries envelope", async () => {
    const entries = [
      { id: 1, orgId: "o1", actor: "u1", action: "member.add", createdAt: 1 },
    ];
    stubFetch(() => json(200, { entries }));

    await expect(client().orgAudit()).resolves.toEqual(entries);
  });

  test("orgUsage asks for the day window and unwraps the rows", async () => {
    const rows = [
      { agentSlug: "a", userId: "u", day: "2026-09-01", messages: 3 },
    ];
    stubFetch(() => json(200, { rows }));

    await expect(client().orgUsage(7)).resolves.toEqual(rows);
    const call = onlyCall();
    expect(call.url).toBe(`${BASE}/v1/org/usage?days=7`);
    expect(call.method).toBe("GET");
    expect(call.org).toBe(ORG);
  });

  test("computeUsage asks for the day window and reads the body whole", async () => {
    const body = { asOf: "2026-09-14T00:00:00Z", awakeNow: ["a"], rows: [] };
    stubFetch(() => json(200, body));

    await expect(client().computeUsage(30)).resolves.toEqual(body);
    expect(onlyCall().url).toBe(`${BASE}/v1/org/compute-usage?days=30`);
  });
});

describe("the degradations the mixin keeps", () => {
  test("a 404 reads as no profiles and no roster — one request each", async () => {
    stubFetch(() => json(404, { error: "not found" }));
    await expect(client().getOrgProfiles(["u1"])).resolves.toEqual({
      profiles: {},
    });
    expect(calls).toHaveLength(1);

    reset();
    await expect(client().getOrgPeople()).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  test("every other failure still surfaces the host's own reason", async () => {
    stubFetch(() => json(500, { error: "roster exploded" }));

    await expect(client().getOrgProfiles(["u1"])).rejects.toThrow(
      "roster exploded (engine error 500)",
    );
    await expect(client().getOrg()).rejects.toThrow(
      "roster exploded (engine error 500)",
    );
  });

  test("a 403 on a mutation is never degraded", async () => {
    stubFetch(() => json(403, { error: "forbidden" }));

    await expect(client().removeOrgMember("u1")).rejects.toThrow(
      "forbidden (engine error 403)",
    );
  });

  test("off-cloud, the cosmetic reads are empty and the rest refuse", async () => {
    const solo = new HoustonClient({ baseUrl: BASE, token: "t" });

    await expect(solo.getOrgProfiles(["u1"])).resolves.toEqual({
      profiles: {},
    });
    await expect(solo.getOrgPeople()).resolves.toEqual([]);
    await expect(solo.getOrg()).rejects.toThrow(
      "multiplayer requires the hosted gateway",
    );
    await expect(solo.computeUsage(7)).rejects.toThrow(
      "compute usage requires the hosted gateway",
    );
  });
});
