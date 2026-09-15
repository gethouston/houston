import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  ORG as ORG_SLUG,
} from "./support/wire-capture";

/**
 * The spaces family rides `sdk.spaces`. What this file pins is the WIRE: the
 * seven gateway routes, their
 * methods, their bodies, the headers that carry auth and the active space, and
 * the percent-encoding of every id spliced into a path.
 *
 * Each case drives the composed `HoustonClient` (what the app holds), not the
 * SDK, and asserts the whole recorded request — a substring match would let a
 * stray `/v1/org/invites/:id` (the OWNER's revoke) pass for the invitee's
 * `/v1/org-invites/:id`.
 *
 * The one degradation this family has stays in the mixin, so it is pinned here
 * too: a 404 from `GET /v1/orgs` is a gateway that predates spaces, and nothing
 * else softens.
 */

const BASE = "https://gw.example";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

/** Local: this family answers its mutations `204`, with no body and no type. */
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
};

/** A cloud client with a team space active, so `x-houston-org` is live. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG_SLUG);
  return c;
}

/** The single request the call made, with the shared headers already checked. */
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
    stubFetch(() => json(200, { orgs: [ORG], invites: [] }));
    expect(await client().listOrgs()).toEqual({ orgs: [ORG], invites: [] });
    const call = soleCall();
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${BASE}/v1/orgs`);
    expect(call.body).toBeNull();
  });

  test("createOrg POSTs /v1/orgs with the name as the whole body", async () => {
    stubFetch(() => json(201, ORG));
    expect(await client().createOrg("Acme")).toEqual(ORG);
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/v1/orgs`);
    expect(call.body).toBe(JSON.stringify({ name: "Acme" }));
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
  // The space slug cannot reach the wire unencoded from here — `deleteWorkspace`
  // only accepts the `org:[a-f0-9]{16}` grammar — so its encoding is pinned on
  // the SDK twin instead (`packages/sdk/src/modules/spaces/spaces.test.ts`).
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
    expect(await client().listOrgs()).toEqual({ orgs: [], invites: [] });
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
    await expect(c.createOrg("Acme")).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
    await expect(c.acceptOrgInvite("inv-1")).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
    await expect(c.declineOrgInvite("inv-1")).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
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
