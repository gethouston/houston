import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createWireCapture, json, ORG } from "./support/wire-capture";

const BASE = "https://gw.example";
const { calls, reset, restore, stubFetch } = createWireCapture();

const CHOICE = {
  needed: true,
  payer: "plus",
  state: "pending",
  provisional: false,
  cutoverAt: "2026-10-23T05:00:00Z",
  changeableUntil: null,
  noticeDismissed: false,
  freeOrgSlug: "1111111111111111",
  paidOrgSlug: "2222222222222222",
  orgs: [
    {
      slug: "1111111111111111",
      name: "La Fila",
      personal: false,
      memberCount: 1,
      messages30d: 396,
      lastActiveOn: "2026-10-19",
      monthlyTotalCents: 1500,
      seatGraceEndsOn: null,
      lockAt: null,
    },
    {
      slug: "2222222222222222",
      name: "Innova",
      personal: false,
      memberCount: 4,
      messages30d: 210,
      lastActiveOn: "2026-10-18",
      monthlyTotalCents: 6000,
      seatGraceEndsOn: "2026-11-22",
      lockAt: null,
    },
  ],
};
const PICK = {
  freeOrgSlug: "1111111111111111",
  paidOrgSlug: "2222222222222222",
};

beforeEach(reset);
afterEach(() => {
  restore();
  vi.clearAllMocks();
});

function client(): HoustonClient {
  const value = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  value.setActiveOrg(ORG);
  return value;
}

function expectAccountHeaders(): void {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("x-houston-org")).toBeNull();
}

describe("billing choice wire", () => {
  test("getBillingChoice uses GET /v1/me/billing-choice with no body", async () => {
    stubFetch(() => json(200, CHOICE));
    expect(await client().getBillingChoice()).toEqual(CHOICE);
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: `${BASE}/v1/me/billing-choice`,
      body: null,
    });
    expectAccountHeaders();
  });

  test("setBillingChoice uses PUT /v1/me/billing-choice with the exact pick", async () => {
    stubFetch(() => json(200, CHOICE));
    expect(await client().setBillingChoice(PICK)).toEqual({
      kind: "saved",
      choice: CHOICE,
    });
    expect(calls[0]).toMatchObject({
      method: "PUT",
      url: `${BASE}/v1/me/billing-choice`,
      body: JSON.stringify(PICK),
    });
    expectAccountHeaders();
  });

  test("dismissBillingChoiceNotice uses POST /v1/me/billing-choice/dismiss with no body", async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    expect(await client().dismissBillingChoiceNotice()).toBeUndefined();
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `${BASE}/v1/me/billing-choice/dismiss`,
      body: null,
    });
    expectAccountHeaders();
  });

  test("a same_org refusal reaches the app as an outcome", async () => {
    stubFetch(() => json(400, { code: "same_org", error: "same org" }));
    expect(
      await client().setBillingChoice({
        freeOrgSlug: PICK.freeOrgSlug,
        paidOrgSlug: PICK.freeOrgSlug,
      }),
    ).toEqual({ kind: "same_org" });
  });

  test("a gateway without the route reads as nothing to show", async () => {
    stubFetch(() => json(404, { error: "not found" }));
    expect(await client().getBillingChoice()).toBeNull();
  });
});
