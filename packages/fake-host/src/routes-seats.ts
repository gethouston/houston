/**
 * Yearly seats on the fake gateway: `POST /v1/org/members/quote`, and the
 * seat side of adding and removing someone in a live yearly org (one whose
 * billing carries `paidSeats` and `seatsInUse`). Every other org falls
 * through to the Teams routes unchanged. A spec makes the next seat charge
 * decline, or need the bank's confirmation, with `/__test__/seat-charge`.
 */

import type { OrgBilling, OrgRole, SeatQuote } from "@houston/wire-types";
import { json } from "./http";
import * as state from "./state";

const YEAR_MS = 365 * 24 * 3_600_000;

type SeatChargeResult = "ok" | "decline" | "needs_action";
let nextCharge: SeatChargeResult = "ok";

/** The next seat charge's answer; it applies once, then charges succeed. */
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

/** What adding one more person costs this org, as the gateway quotes it. */
export function quoteFor(billing: OrgBilling | null, now: number): SeatQuote {
  const yearly = yearlySeats(billing);
  if (yearly) {
    const { paidSeats, seatsInUse } = yearly;
    if (paidSeats > seatsInUse)
      return { kind: "free_seat", paidSeats, seatsInUse };
    if (!yearly.isBillingOwner)
      return { kind: "billing_owner_only", paidSeats, seatsInUse };
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

/** Route a seat call, or return `undefined` to fall through. */
export function handleSeatRoutes(
  method: string,
  segs: string[],
  req: Request,
  body: Record<string, unknown> | undefined,
): Response | undefined {
  if (segs[0] !== "v1" || segs[1] !== "org") return undefined;
  const slug = state.requestOrgSlug(req);
  const billing = state.orgBillingOf(slug);
  if (method === "POST" && segs.join("/") === "v1/org/members/quote")
    return json(quoteFor(billing, Date.now()));
  const yearly = yearlySeats(billing);
  if (!yearly) return undefined;
  const removes =
    method === "DELETE" &&
    segs.length === 4 &&
    (segs[2] === "members" || segs[2] === "invites");
  if (removes) {
    // A removed seat stays paid until renewal: only the use drops.
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
    // An add that carries no quote is told the seat is now charged.
    if (typeof body?.prorationDate !== "number")
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
