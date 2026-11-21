import type { OrgBilling, OrgRole, SeatQuote } from "@houston/wire-types";
import { json } from "./http";
import * as state from "./state";

const YEAR_MS = 365 * 24 * 3_600_000;

export const FAKE_BILLING_OWNER_NAME = "Ana Ruiz";

type SeatChargeResult = "ok" | "decline" | "needs_action";
let nextCharge: SeatChargeResult = "ok";

export function setSeatChargeResult(result: SeatChargeResult): void {
  nextCharge = result;
}

type YearlySeats = OrgBilling & {
  paidSeats: number;
  seatsInUse: number;
  renewsAt: string;
  seatPriceCents: number;
};

function yearlySeats(billing: OrgBilling | null): YearlySeats | null {
  if (billing?.tier !== "paid" || billing.interval !== "year") return null;
  const { paidSeats, seatsInUse, renewsAt, seatPriceCents } = billing;
  if (paidSeats === null || seatsInUse === null) return null;
  if (renewsAt === null || seatPriceCents === null) return null;
  return { ...billing, paidSeats, seatsInUse, renewsAt, seatPriceCents };
}

export function quoteFor(billing: OrgBilling | null, now: number): SeatQuote {
  const yearly = yearlySeats(billing);
  if (yearly) {
    const { paidSeats, seatsInUse } = yearly;
    if (paidSeats > seatsInUse)
      return { kind: "free_seat", paidSeats, seatsInUse };
    if (!yearly.isBillingOwner)
      return {
        kind: "billing_owner_only",
        paidSeats,
        seatsInUse,
        billingOwnerName: FAKE_BILLING_OWNER_NAME,
      };
    const left = Math.max(0, Date.parse(yearly.renewsAt) - now);
    return {
      kind: "charge",
      amountCents: Math.round((yearly.seatPriceCents * left) / YEAR_MS),
      currency: "usd",
      prorationDate: Math.floor(now / 1000),
      paidSeats,
      seatsInUse,
      renewsAt: yearly.renewsAt,
    };
  }
  if (billing?.tier === "paid" && billing.interval === "month")
    return {
      kind: "next_invoice",
      seatPriceCents: billing.seatPriceCents ?? 0,
    };
  return { kind: "no_charge" };
}

const refuse = (status: number, code: string): Response =>
  json({ error: code, code }, status);

export function handleSeatRoutes(
  method: string,
  segs: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (segs[0] !== "v1" || segs[1] !== "org") return undefined;
  const slug = state.requestOrgSlug(req);
  const billing = state.orgBillingOf(slug);
  if (method === "POST" && segs.join("/") === "v1/org/members/quote") {
    if (state.orgWritesLocked(slug))
      return json(
        { error: "this organization is locked", code: "needs_upgrade" },
        403,
      );
    return json(quoteFor(billing, Date.now()));
  }
  const yearly = yearlySeats(billing);
  if (!yearly) return undefined;
  const removes =
    method === "DELETE" &&
    segs.length === 4 &&
    (segs[2] === "members" || segs[2] === "invites");
  if (removes) {
    state.setOrgBilling(slug, {
      ...yearly,
      seatsInUse: Math.max(0, yearly.seatsInUse - 1),
    });
    return undefined;
  }
  if (method !== "POST" || segs.join("/") !== "v1/org/members")
    return undefined;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return json({ error: "missing email" }, 400);
  const quote = quoteFor(yearly, Date.now());
  if (quote.kind === "billing_owner_only") return refuse(403, quote.kind);
  let paidSeats = yearly.paidSeats;
  if (quote.kind === "charge") {
    if (req.headers.has("x-houston-acting-as"))
      return refuse(403, "seat_charge_in_app");
    if (
      typeof body?.prorationDate !== "number" ||
      body?.quotedAmountCents !== quote.amountCents
    )
      return refuse(409, "seat_quote_changed");
    const result = nextCharge;
    nextCharge = "ok";
    if (result === "decline") return refuse(402, "seat_payment_failed");
    if (result === "needs_action")
      return refuse(402, "seat_payment_needs_action");
    paidSeats += 1;
  }
  state.setOrgBilling(slug, {
    ...yearly,
    paidSeats,
    seatsInUse: yearly.seatsInUse + 1,
    seats: yearly.seats + 1,
  });
  const role: OrgRole = body?.role === "admin" ? "admin" : "user";
  const invite = state.addOrgInvite(email, role);
  return json({ invited: true, email: invite.email, role: invite.role }, 202);
}
