import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeHost, startFakeHost } from "./server";

const TEAM = "00000000000000ab";
const RENEWS = new Date(Date.now() + 150 * 24 * 3_600_000).toISOString();
const YEARLY = {
  tier: "paid",
  status: "active",
  lockAt: null,
  lockReason: null,
  freeSlot: false,
  isBillingOwner: true,
  seats: 2,
  interval: "year",
  seatPriceCents: 18000,
  seatPrices: { monthlyCents: 2000, annualCents: 18000 },
  seatGraceEndsAt: null,
  renewsAt: RENEWS,
  priceNotice: null,
  paidSeats: 2,
  seatsInUse: 2,
  usage: null,
  routines: null,
};

describe("yearly seats on the fake gateway", () => {
  let host: FakeHost;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(`${host.url}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-houston-org": TEAM },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const arm = (billing: Record<string, unknown>) =>
    send("POST", "/__test__/workspaces", {
      teams: [{ slug: TEAM, name: "Acme", billing }],
    });
  const quote = async () =>
    (await send("POST", "/v1/org/members/quote", {})).json();
  const add = (prorationDate?: number, quotedAmountCents?: number) =>
    send("POST", "/v1/org/members", {
      email: "jo@x.co",
      role: "user",
      prorationDate,
      quotedAmountCents,
    });

  beforeEach(async () => {
    host = await startFakeHost(0);
    await send("POST", "/__test__/reset");
    await send("POST", "/__test__/capabilities", { spaces: true });
  });
  afterEach(async () => {
    await host.stop();
  });

  it("quotes a charge for the time left, then charges the add", async () => {
    await arm(YEARLY);
    const charge = await quote();
    expect(charge).toMatchObject({
      kind: "charge",
      currency: "usd",
      paidSeats: 2,
      seatsInUse: 2,
      renewsAt: RENEWS,
    });
    expect(charge.amountCents).toBeGreaterThan(7000);
    expect(charge.amountCents).toBeLessThan(7500);
    expect((await add(charge.prorationDate, charge.amountCents)).status).toBe(
      202,
    );
    expect(await quote()).toMatchObject({ kind: "charge", paidSeats: 3 });
  });

  it("refuses a charge with no quote, a moved amount, a declined card, and a bank check", async () => {
    await arm(YEARLY);
    expect(await (await add()).json()).toMatchObject({
      code: "seat_quote_changed",
    });
    const { prorationDate, amountCents } = await quote();
    expect(
      await (await add(prorationDate, amountCents + 1)).json(),
    ).toMatchObject({ code: "seat_quote_changed" });
    const again = async () => {
      const fresh = await quote();
      return add(fresh.prorationDate, fresh.amountCents);
    };
    await send("POST", "/__test__/seat-charge", { result: "decline" });
    const declined = await again();
    expect(declined.status).toBe(402);
    expect(await declined.json()).toMatchObject({
      code: "seat_payment_failed",
    });
    await send("POST", "/__test__/seat-charge", { result: "needs_action" });
    expect(await (await again()).json()).toMatchObject({
      code: "seat_payment_needs_action",
    });
    expect((await again()).status).toBe(202);
  });

  it("refuses a paid seat to the AI Manager", async () => {
    await arm(YEARLY);
    const { prorationDate, amountCents } = await quote();
    const res = await fetch(`${host.url}/v1/org/members`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-houston-org": TEAM,
        "x-houston-acting-as": "u1",
      },
      body: JSON.stringify({
        email: "jo@x.co",
        role: "user",
        prorationDate,
        quotedAmountCents: amountCents,
      }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "seat_charge_in_app" });
  });

  it("quotes nothing on a locked org", async () => {
    await arm({
      ...YEARLY,
      status: "locked",
      lockAt: "2026-10-01T00:00:00.000Z",
      lockReason: "payment_failed",
    });
    const res = await send("POST", "/v1/org/members/quote", {});
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "needs_upgrade" });
  });

  it("fills a free paid seat at no charge, and keeps a removed seat paid", async () => {
    await arm({ ...YEARLY, paidSeats: 3 });
    expect(await quote()).toEqual({
      kind: "free_seat",
      paidSeats: 3,
      seatsInUse: 2,
    });
    expect((await add()).status).toBe(202);
    await send("DELETE", "/v1/org/members/u2");
    expect(await quote()).toMatchObject({ kind: "free_seat", seatsInUse: 2 });
  });

  it("stops another owner at a full org, and quotes a monthly one", async () => {
    await arm({ ...YEARLY, isBillingOwner: false });
    expect(await quote()).toMatchObject({ kind: "billing_owner_only" });
    expect((await add()).status).toBe(403);
    await arm({ ...YEARLY, interval: "month", seatPriceCents: 2000 });
    expect(await quote()).toEqual({
      kind: "next_invoice",
      seatPriceCents: 2000,
    });
  });
});
