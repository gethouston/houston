import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { freeOrgBilling } from "../billing/org-billing-fixtures";
import { SpacesCommand, SpacesHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

const ORG = {
  id: "o1",
  slug: "0123456789abcdef",
  name: "Acme",
  kind: "team" as const,
  role: "owner" as const,
  memberCount: 4,
  degraded: false,
  billing: null,
};
const BILLED = { ...ORG, billing: freeOrgBilling() };

/**
 * A spaces SDK over a mock `fetch` that records the whole wire. `reactivity` is
 * off, so every recorded call is one a spaces operation made and nothing else —
 * which is what makes "exactly one request" an exact claim.
 */
function makeSdk(answer: (path: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({
        method: init?.method ?? "GET",
        url,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return answer(new URL(url).pathname);
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

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "content-type": "application/json" },
  });

const ok = (body: unknown) => makeSdk(() => json(body));

describe("the spaces requests", () => {
  it("reads the caller's spaces and invites off GET /v1/orgs", async () => {
    const { sdk, calls } = ok({
      orgs: [BILLED],
      invites: [],
      freeOrg: { available: false, orgSlug: ORG.slug },
    });
    expect(await sdk.spaces.listOrgs()).toEqual({
      orgs: [BILLED],
      invites: [],
      freeOrg: { available: false, orgSlug: ORG.slug },
    });
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/v1/orgs`, body: null },
    ]);
  });

  it("reads a legacy org, an older team summary and no free slot as null", async () => {
    const legacy = { ...ORG, slug: "1111111111111111" };
    const { billing: _none, ...noBilling } = legacy;
    const olderTeam = {
      ...ORG,
      billing: { plan: "team", status: "trialing", seats: 3 },
    };
    const { sdk } = ok({ orgs: [noBilling, olderTeam], invites: [] });
    expect(await sdk.spaces.listOrgs()).toEqual({
      orgs: [legacy, ORG],
      invites: [],
      freeOrg: null,
    });
  });

  it("creates a free org unless told paid", async () => {
    const { sdk, calls } = ok(BILLED);
    expect(await sdk.spaces.createOrg({ name: "Acme" })).toEqual({
      kind: "created",
      org: BILLED,
    });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/orgs`,
        body: JSON.stringify({ name: "Acme", plan: "free" }),
      },
    ]);
  });

  it("answers a taken free slot as an outcome, naming the org that holds it", async () => {
    const { sdk } = makeSdk(() =>
      json(
        {
          code: "free_org_taken",
          error: "free org taken",
          freeOrgSlug: "fedcba9876543210",
        },
        409,
      ),
    );
    expect(await sdk.spaces.createOrg({ name: "Acme" })).toEqual({
      kind: "free_org_taken",
      freeOrgSlug: "fedcba9876543210",
    });
  });

  it("answers a paid create with the locked org and its checkout", async () => {
    const locked = {
      ...ORG,
      degraded: true,
      billing: freeOrgBilling({
        status: "locked",
        lockAt: "2026-10-23T00:00:00Z",
        lockReason: "unpaid",
        freeSlot: false,
      }),
    };
    const { sdk, calls } = ok({
      ...locked,
      checkoutUrl: "https://checkout.stripe.test/c/9",
    });
    expect(await sdk.spaces.createOrg({ name: "Acme", plan: "paid" })).toEqual({
      kind: "checkout",
      org: locked,
      checkoutUrl: "https://checkout.stripe.test/c/9",
    });
    expect(calls[0].body).toBe(
      JSON.stringify({ name: "Acme", plan: "paid", interval: "month" }),
    );
    await sdk.spaces.createOrg({
      name: "Acme",
      plan: "paid",
      interval: "year",
    });
    expect(calls[1].body).toBe(
      JSON.stringify({ name: "Acme", plan: "paid", interval: "year" }),
    );
    // A free create starts no checkout, so it never names an interval.
    await sdk.spaces.createOrg({ name: "Acme", interval: "year" });
    expect(calls[2].body).toBe(JSON.stringify({ name: "Acme", plan: "free" }));
  });

  it("still throws a 409 that is not the free slot", async () => {
    for (const body of [
      { code: "free_org_taken" },
      { code: "name_taken", freeOrgSlug: "fedcba9876543210" },
    ]) {
      const { sdk } = makeSdk(() => json(body, 409));
      await expect(
        sdk.spaces.createOrg({ name: "Acme" }),
      ).rejects.toBeInstanceOf(SpacesHttpError);
    }
  });

  it("deletes a space by slug, percent-encoded into the path", async () => {
    const { sdk, calls } = makeSdk(() => json(null, 204));
    await sdk.spaces.deleteOrg("a/b c");
    expect(calls).toEqual([
      { method: "DELETE", url: `${BASE}/v1/orgs/a%2Fb%20c`, body: null },
    ]);
  });

  it("unwraps the {org} envelope an accept answers with", async () => {
    const { sdk, calls } = ok({ org: BILLED });
    expect(await sdk.spaces.acceptOrgInvite("inv/1 2")).toEqual(BILLED);
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/org-invites/inv%2F1%202/accept`,
        body: null,
      },
    ]);
  });

  it("declines an invite with a DELETE on the cross-org route", async () => {
    const { sdk, calls } = makeSdk(() => json(null, 204));
    await sdk.spaces.declineOrgInvite("inv-2");
    expect(calls).toEqual([
      { method: "DELETE", url: `${BASE}/v1/org-invites/inv-2`, body: null },
    ]);
  });

  it("starts a move with the destination slug as `to`", async () => {
    const { sdk, calls } = ok({ moveId: "mv1" });
    expect(await sdk.spaces.moveAgent("ag 1", "0123456789abcdef")).toEqual({
      moveId: "mv1",
    });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/v1/agents/ag%201/move`,
        body: JSON.stringify({ to: "0123456789abcdef" }),
      },
    ]);
  });

  it("polls one move by agent and move id", async () => {
    const { sdk, calls } = ok({ status: "moving" });
    expect(await sdk.spaces.getMoveStatus("ag 1", "mv/1")).toEqual({
      status: "moving",
    });
    expect(calls).toEqual([
      {
        method: "GET",
        url: `${BASE}/v1/agents/ag%201/move/mv%2F1`,
        body: null,
      },
    ]);
  });
});

describe("what the module refuses to soften", () => {
  it("throws a SpacesHttpError carrying the status — a 404 never degrades", async () => {
    const { sdk } = makeSdk(() => json({ error: "no orgs here" }, 404));
    const err = await sdk.spaces.listOrgs().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SpacesHttpError);
    expect((err as SpacesHttpError).status).toBe(404);
    // The body travels as the message, which is what the web adapter parses
    // back into a HoustonEngineError.
    expect((err as SpacesHttpError).message).toBe(
      JSON.stringify({ error: "no orgs here" }),
    );
  });

  it("a 403 needs_upgrade on an accept reaches the caller", async () => {
    const { sdk } = makeSdk(() => json({ code: "needs_upgrade" }, 403));
    await expect(sdk.spaces.acceptOrgInvite("inv-1")).rejects.toBeInstanceOf(
      SpacesHttpError,
    );
  });

  it("a 401 reaches the caller with its body intact", async () => {
    const { sdk } = makeSdk(() => json({ error: "signed_out" }, 401));
    const err = await sdk.spaces.listOrgs().catch((e: unknown) => e);
    expect((err as SpacesHttpError).status).toBe(401);
    expect((err as SpacesHttpError).message).toBe(
      JSON.stringify({ error: "signed_out" }),
    );
  });
});

describe("the dispatch path", () => {
  it("dispatches a create through the same handler the facade uses", async () => {
    const { sdk, calls } = ok(ORG);
    const result = await sdk.dispatch({
      id: "1",
      type: SpacesCommand.Create,
      payload: { name: "Acme" },
    });
    expect(result.ok).toBe(true);
    expect(calls[0].body).toBe(JSON.stringify({ name: "Acme", plan: "free" }));
    await sdk.dispatch({
      id: "1b",
      type: SpacesCommand.Create,
      payload: { name: "Acme", plan: "paid" },
    });
    expect(calls[1].body).toBe(
      JSON.stringify({ name: "Acme", plan: "paid", interval: "month" }),
    );
    await sdk.dispatch({
      id: "1c",
      type: SpacesCommand.Create,
      payload: { name: "Acme", plan: "paid", interval: "year" },
    });
    expect(calls[2].body).toBe(
      JSON.stringify({ name: "Acme", plan: "paid", interval: "year" }),
    );
  });

  it("rejects a move with no agent named, without touching the wire", async () => {
    const { sdk, calls } = ok({ moveId: "mv1" });
    const result = await sdk.dispatch({
      id: "2",
      type: SpacesCommand.MoveAgent,
      payload: { to: "0123456789abcdef" },
    });
    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
