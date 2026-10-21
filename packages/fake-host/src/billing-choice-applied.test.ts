import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

const org = (slug: string, name: string): BillingChoiceOrg => ({
  slug,
  name,
  personal: false,
  memberCount: 1,
  messages30d: 0,
  lastActiveOn: null,
  monthlyTotalCents: null,
  seatGraceEndsOn: null,
  lockAt: null,
});

const WINDOW_END = "2026-11-06T05:00:00Z";
const INSIDE = "2026-10-25T17:00:00Z";
const AFTER = "2026-11-07T00:00:00Z";
const ACME = "1111111111111111";
const PERSONAL = "2222222222222222";
const LA_FILA = "3333333333333333";

/** What the cutover left a Plus payer who never picked. */
const PROVISIONAL: BillingChoice = {
  needed: true,
  payer: "plus",
  state: "applied",
  provisional: true,
  cutoverAt: "2026-10-23T05:00:00Z",
  changeableUntil: WINDOW_END,
  noticeDismissed: false,
  freeOrgSlug: PERSONAL,
  paidOrgSlug: ACME,
  orgs: [
    org(ACME, "Acme"),
    org(PERSONAL, "Personal"),
    { ...org(LA_FILA, "La Fila"), lockAt: WINDOW_END },
  ],
};

describe("billing choice after the cutover", () => {
  let host: FakeHost;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${host.url}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const arm = (now: string) =>
    send("POST", "/__test__/billing-choice", { choice: PROVISIONAL, now });

  beforeEach(async () => {
    host = await startFakeHost(0);
    await send("POST", "/__test__/reset");
  });
  afterEach(async () => {
    await host.stop();
  });

  it("answers the applied, provisional pick", async () => {
    await arm(INSIDE);
    expect(await (await send("GET", "/v1/me/billing-choice")).json()).toEqual(
      PROVISIONAL,
    );
  });

  it("applies a changed pick at once: the picked orgs unlock, the rest lock when the window ends", async () => {
    await arm(INSIDE);
    const res = await send("PUT", "/v1/me/billing-choice", {
      freeOrgSlug: PERSONAL,
      paidOrgSlug: LA_FILA,
    });
    expect(res.status).toBe(200);
    const changed = {
      ...PROVISIONAL,
      provisional: false,
      paidOrgSlug: LA_FILA,
      orgs: [
        { ...org(ACME, "Acme"), lockAt: WINDOW_END },
        org(PERSONAL, "Personal"),
        org(LA_FILA, "La Fila"),
      ],
    };
    expect(await res.json()).toEqual(changed);
    expect(await (await send("GET", "/v1/me/billing-choice")).json()).toEqual(
      changed,
    );
  });

  it("answers a repeated applied pick unchanged", async () => {
    await arm(INSIDE);
    const res = await send("PUT", "/v1/me/billing-choice", {
      freeOrgSlug: PERSONAL,
      paidOrgSlug: ACME,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PROVISIONAL);
  });

  it("refuses any pick once the window closed with 409 choice_closed", async () => {
    await arm(AFTER);
    const res = await send("PUT", "/v1/me/billing-choice", {
      freeOrgSlug: PERSONAL,
      paidOrgSlug: ACME,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "choice_closed",
      code: "choice_closed",
    });
    expect(await (await send("GET", "/v1/me/billing-choice")).json()).toEqual(
      PROVISIONAL,
    );
  });
});
