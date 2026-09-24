import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { OrgCommand, OrgHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/**
 * An inert SDK (`reactivity:false`) over a mock `fetch` that records the whole
 * request and answers whatever the test queues. The `/v1/org*` routes are
 * gateway-only, so every assertion here is about the exact URL, method and body
 * bytes that reach the wire — and about the fact that nothing is swallowed: the
 * two 404 degradations this family has belong to the CALLER (the web adapter's
 * mixin), never to the SDK, or a surface would be handed an empty roster it
 * cannot tell from a real one.
 */
function makeSdk(respond: (url: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond(String(input));
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const ORG = {
  id: "o1",
  slug: "0123456789abcdef",
  name: "Acme",
  role: "owner",
  members: [{ userId: "u1", role: "owner" }],
};

describe("org module — the active space and its roster", () => {
  it("reads the space off /v1/org", async () => {
    const { sdk, calls } = makeSdk(() => json(ORG));

    await expect(sdk.org.getOrg()).resolves.toEqual(ORG);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/org`, body: null },
    ]);
  });

  it("asks for profiles by a comma-joined, escaped id list", async () => {
    const { sdk, calls } = makeSdk(() => json({ profiles: { u1: {} } }));

    await expect(sdk.org.getOrgProfiles(["u1", "u 2/3"])).resolves.toEqual({
      profiles: { u1: {} },
    });
    expect(calls[0].url).toBe(`${BASE}/v1/org/profiles?ids=u1%2Cu+2%2F3`);
  });

  it("answers an empty id list without asking the gateway", async () => {
    const { sdk, calls } = makeSdk(() => json({ profiles: {} }));

    await expect(sdk.org.getOrgProfiles([])).resolves.toEqual({ profiles: {} });
    expect(calls).toEqual([]);
  });

  it("unwraps the roster envelope, and an absent list reads as empty", async () => {
    const people = [{ userId: "u1", displayName: "Ada" }];
    const withPeople = makeSdk(() => json({ people }));
    await expect(withPeople.sdk.org.getOrgPeople()).resolves.toEqual(people);
    expect(withPeople.calls[0].url).toBe(`${BASE}/v1/org/people`);

    const without = makeSdk(() => json({}));
    await expect(without.sdk.org.getOrgPeople()).resolves.toEqual([]);
  });

  it("propagates a 404 instead of degrading — the caller decides", async () => {
    const people = makeSdk(() => json({ error: "not found" }, 404));
    await expect(people.sdk.org.getOrgPeople()).rejects.toBeInstanceOf(
      OrgHttpError,
    );

    const profiles = makeSdk(() => json({ error: "not found" }, 404));
    await expect(profiles.sdk.org.getOrgProfiles(["u1"])).rejects.toMatchObject(
      { status: 404 },
    );
  });
});

describe("org module — membership writes", () => {
  it("posts an invite with the email and role the caller chose", async () => {
    const { sdk, calls } = makeSdk(() =>
      json({ role: "user", invited: true, email: "ada@x.co" }),
    );

    await expect(sdk.org.addOrgMember("ada@x.co", "user")).resolves.toEqual({
      role: "user",
      invited: true,
      email: "ada@x.co",
    });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/org/members`,
        body: JSON.stringify({ email: "ada@x.co", role: "user" }),
      },
    ]);
  });

  it("escapes the id it splices into an invite or member address", async () => {
    const { sdk, calls } = makeSdk(() => json({}));

    await sdk.org.deleteOrgInvite("inv/1 2");
    await sdk.org.removeOrgMember("u/1");
    await sdk.org.setOrgMemberRole("u/1", "admin");

    expect(calls).toEqual([
      {
        method: "DELETE",
        url: `${BASE}/v1/org/invites/inv%2F1%202`,
        body: null,
      },
      { method: "DELETE", url: `${BASE}/v1/org/members/u%2F1`, body: null },
      {
        method: "PATCH",
        url: `${BASE}/v1/org/members/u%2F1`,
        body: JSON.stringify({ role: "admin" }),
      },
    ]);
  });
});

describe("org module — activity and usage", () => {
  it("sends only the audit bounds the caller supplied", async () => {
    const entries = [{ id: 1, orgId: "o1", actor: "u1", action: "member.add" }];
    const none = makeSdk(() => json({ entries }));
    await expect(none.sdk.org.orgAudit()).resolves.toEqual(entries);
    expect(none.calls[0].url).toBe(`${BASE}/v1/org/audit`);

    const limitOnly = makeSdk(() => json({ entries }));
    await limitOnly.sdk.org.orgAudit(undefined, 50);
    expect(limitOnly.calls[0].url).toBe(`${BASE}/v1/org/audit?limit=50`);

    const both = makeSdk(() => json({ entries }));
    await both.sdk.org.orgAudit(1700, 50);
    expect(both.calls[0].url).toBe(`${BASE}/v1/org/audit?before=1700&limit=50`);
  });

  it("unwraps the usage rows and reads compute usage whole", async () => {
    const rows = [
      { agentSlug: "a", userId: "u", day: "2026-09-01", messages: 3 },
    ];
    const usage = makeSdk(() => json({ rows }));
    await expect(usage.sdk.org.orgUsage(7)).resolves.toEqual(rows);
    expect(usage.calls[0].url).toBe(`${BASE}/v1/org/usage?days=7`);

    const compute = { asOf: "2026-09-14T00:00:00Z", awakeNow: [], rows: [] };
    const computed = makeSdk(() => json(compute));
    await expect(computed.sdk.org.computeUsage(30)).resolves.toEqual(compute);
    expect(computed.calls[0].url).toBe(`${BASE}/v1/org/compute-usage?days=30`);
  });
});

describe("org module — the dispatch path", () => {
  it("dispatches the same handlers the facade calls", async () => {
    const { sdk, calls } = makeSdk(() => json({}));

    const result = await sdk.dispatch({
      id: "1",
      type: OrgCommand.SetMemberRole,
      payload: { userId: "u1", role: "admin" },
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual({
      method: "PATCH",
      url: `${BASE}/v1/org/members/u1`,
      body: JSON.stringify({ role: "admin" }),
    });
  });

  it("refuses a role the protocol does not define", async () => {
    const { sdk, calls } = makeSdk(() => json({}));

    const result = await sdk.dispatch({
      id: "1",
      type: OrgCommand.SetMemberRole,
      payload: { userId: "u1", role: "root" },
    });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("keeps an omitted audit bound omitted across the dispatch path", async () => {
    const { sdk, calls } = makeSdk(() => json({ entries: [] }));

    await sdk.dispatch({
      id: "1",
      type: OrgCommand.Audit,
      payload: { limit: 10 },
    });

    expect(calls[0].url).toBe(`${BASE}/v1/org/audit?limit=10`);
  });
});
