import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  ORG as ORG_SLUG,
} from "./support/wire-capture";

const BASE = "https://gw.example";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const json = (status: number, body: unknown = {}): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "Content-Type": "application/json" },
  });

const ORG = {
  id: "o1",
  slug: ORG_SLUG,
  name: "Acme",
  kind: "team",
  role: "owner",
  memberCount: 4,
  degraded: false,
  billing: null,
};

function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG_SLUG);
  return c;
}

function soleCall(): Call {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG_SLUG);
  return call;
}

describe("the delegated spaces requests", () => {
  test("listOrgs GETs /v1/orgs", async () => {
    const freeOrg = { available: false, orgSlug: ORG_SLUG };
    stubFetch(() => json(200, { orgs: [ORG], invites: [], freeOrg }));
    expect(await client().listOrgs()).toEqual({
      orgs: [ORG],
      invites: [],
      freeOrg,
    });
    const call = soleCall();
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${BASE}/v1/orgs`);
    expect(call.body).toBeNull();
  });

  test("createOrg POSTs /v1/orgs with the name and a free plan", async () => {
    stubFetch(() => json(201, ORG));
    expect(await client().createOrg({ name: "Acme" })).toEqual({
      kind: "created",
      org: ORG,
    });
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v1/orgs`);
    expect(call.body).toBe(JSON.stringify({ name: "Acme", plan: "free" }));
  });

  test("createOrg answers a taken free slot as an outcome, not a failure", async () => {
    stubFetch(() =>
      json(409, {
        error: "you already have a free organization",
        code: "free_org_taken",
        freeOrgSlug: "0000000000000bbb",
      }),
    );
    expect(await client().createOrg({ name: "Acme" })).toEqual({
      kind: "free_org_taken",
      freeOrgSlug: "0000000000000bbb",
    });
  });

  test("a paid createOrg answers the org with its checkout", async () => {
    stubFetch(() =>
      json(201, { ...ORG, checkoutUrl: "https://checkout.stripe.test/c/9" }),
    );
    expect(await client().createOrg({ name: "Acme", plan: "paid" })).toEqual({
      kind: "checkout",
      org: ORG,
      checkoutUrl: "https://checkout.stripe.test/c/9",
    });
    expect(soleCall().body).toBe(
      JSON.stringify({ name: "Acme", plan: "paid" }),
    );
  });

  test("a paid createOrg whose yearly interval is refused creates nothing", async () => {
    stubFetch(() =>
      json(409, { error: "yearly off", code: "interval_unavailable" }),
    );
    expect(
      await client().createOrg({
        name: "Acme",
        plan: "paid",
        interval: "year",
      }),
    ).toEqual({ kind: "interval_unavailable" });
  });

  test("a yearly paid createOrg names its interval", async () => {
    stubFetch(() =>
      json(201, { ...ORG, checkoutUrl: "https://checkout.stripe.test/c/9" }),
    );
    await client().createOrg({ name: "Acme", plan: "paid", interval: "year" });
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v1/orgs`);
    expect(call.body).toBe(
      JSON.stringify({ name: "Acme", plan: "paid", interval: "year" }),
    );
  });

  test("deleteWorkspace DELETEs /v1/orgs/:slug", async () => {
    stubFetch(() => json(204));
    await client().deleteWorkspace(`org:${ORG_SLUG}`);
    const call = soleCall();
    expect(call.method).toBe("DELETE");
    expect(call.url).toBe(`${BASE}/v1/orgs/${ORG_SLUG}`);
    expect(call.body).toBeNull();
  });

  test("acceptOrgInvite POSTs the cross-org accept and unwraps {org}", async () => {
    stubFetch(() => json(201, { org: ORG }));
    expect(await client().acceptOrgInvite("inv-1")).toEqual(ORG);
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v1/org-invites/inv-1/accept`);
    expect(call.body).toBeNull();
  });

  test("declineOrgInvite DELETEs the cross-org invite route", async () => {
    stubFetch(() => json(204));
    await client().declineOrgInvite("inv-2");
    const call = soleCall();
    expect(call.method).toBe("DELETE");
    expect(call.url).toBe(`${BASE}/v1/org-invites/inv-2`);
  });

  test("moveAgent POSTs the move with the destination as `to`", async () => {
    stubFetch(() => json(202, { moveId: "mv1" }));
    expect(await client().moveAgent("ag-1", ORG_SLUG)).toEqual({
      moveId: "mv1",
    });
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v1/agents/ag-1/move`);
    expect(call.body).toBe(JSON.stringify({ to: ORG_SLUG }));
  });

  test("getMoveStatus GETs the one route a move completes on", async () => {
    stubFetch(() => json(200, { status: "done" }));
    expect(await client().getMoveStatus("ag-1", "mv1")).toEqual({
      status: "done",
    });
    const call = soleCall();
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${BASE}/v1/agents/ag-1/move/mv1`);
  });
});

describe("every id spliced into a path is percent-encoded", () => {
  test("the invite id, the agent slug and the move id", async () => {
    stubFetch(() => json(200, { org: ORG, moveId: "m", status: "done" }));
    const c = client();
    await c.acceptOrgInvite("inv/1 2");
    await c.declineOrgInvite("inv/1 2");
    await c.moveAgent("ag/1 2", ORG_SLUG);
    await c.getMoveStatus("ag/1 2", "mv/1 2");
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/v1/org-invites/inv%2F1%202/accept`,
      `${BASE}/v1/org-invites/inv%2F1%202`,
      `${BASE}/v1/agents/ag%2F1%202/move`,
      `${BASE}/v1/agents/ag%2F1%202/move/mv%2F1%202`,
    ]);
    expect(calls.map((call) => call.url).join()).not.toContain("?");
  });
});

describe("what the mixin softens, and what it must not", () => {
  test("a 404 on listOrgs is a gateway that predates spaces", async () => {
    stubFetch(() => json(404, { error: "not found" }));
    expect(await client().listOrgs()).toEqual({
      orgs: [],
      invites: [],
      freeOrg: null,
    });
  });

  test("any other listOrgs failure reaches the caller", async () => {
    stubFetch(() => json(403, { error: "forbidden" }));
    await expect(client().listOrgs()).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
  });

  test("createOrg, accept and decline never degrade", async () => {
    stubFetch(() => json(404, { error: "invite not found" }));
    const c = client();
    await expect(c.createOrg({ name: "Acme" })).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
    await expect(c.acceptOrgInvite("inv-1")).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
    await expect(c.declineOrgInvite("inv-1")).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
  });

  test("a move into a team that holds the name rejects 409 name_taken", async () => {
    stubFetch(() =>
      json(409, {
        error: "an agent with that name exists",
        code: "name_taken",
      }),
    );
    const err = await client()
      .moveAgent("ag-1", ORG_SLUG)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(409);
    expect((err as HoustonEngineError).body).toMatchObject({
      code: "name_taken",
    });
    expect(soleCall().url).toBe(`${BASE}/v1/agents/ag-1/move`);
  });

  test("a move the agent already finished rejects 409 agent_moved", async () => {
    stubFetch(() =>
      json(409, { error: "agent already moved", code: "agent_moved" }),
    );
    const err = await client()
      .moveAgent("ag-1", ORG_SLUG)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(409);
    expect((err as HoustonEngineError).body).toMatchObject({
      code: "agent_moved",
    });
    expect(soleCall().url).toBe(`${BASE}/v1/agents/ag-1/move`);
  });

  test("an agent in neither space rejects 404 agent_not_found", async () => {
    stubFetch(() =>
      json(404, { error: "agent not found", code: "agent_not_found" }),
    );
    const err = await client()
      .moveAgent("ag-1", ORG_SLUG)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(404);
    expect((err as HoustonEngineError).body).toMatchObject({
      code: "agent_not_found",
    });
  });

  test("an older gateway's uncoded 404 stays a plain rejection", async () => {
    stubFetch(() => json(404, { error: "agent not found" }));
    const err = await client()
      .moveAgent("ag-1", ORG_SLUG)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(404);
    expect((err as HoustonEngineError).body).not.toHaveProperty("code");
  });

  test("a rejection keeps the gateway's parsed body and status", async () => {
    stubFetch(() =>
      json(409, { error: "members remain", code: "has_members" }),
    );
    const err = await client()
      .deleteWorkspace(`org:${ORG_SLUG}`)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(409);
    expect((err as HoustonEngineError).body).toMatchObject({
      code: "has_members",
    });
  });
});
