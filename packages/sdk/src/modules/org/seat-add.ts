/**
 * Adding someone to the active org when a seat may cost money: the quote that
 * says what the add will charge, and the add itself, which carries the quote's
 * `prorationDate` back so the charge is the one the person saw.
 *
 * The seat refusals come back as outcomes, never as thrown errors: a declined
 * card, a bank that wants to confirm the payment, and a payer-only seat are
 * states the person acts on. A quote that went stale (`seat_quote_changed`,
 * `seat_quote_expired`) is re-quoted HERE, so every surface shows the new price
 * the same way instead of each deciding what a 409 means.
 */

import {
  parseSeatQuote,
  SEAT_ADD_REFUSALS,
  type SeatAddRefusal,
  type SeatQuote,
} from "@houston/wire-types";
import { type HttpScope, httpRequest } from "../http";
import { refusalCode, refusalStatus } from "../refusal-code";
import type { AddOrgMemberResult, OrgRole } from "./types";

/**
 * What an add answered: the person added (or invited), a refusal the person
 * acts on (nobody was added and nothing was charged), or a fresh quote because
 * the one the add carried no longer holds.
 */
export type AddOrgMemberOutcome =
  | { kind: "added"; member: AddOrgMemberResult }
  | { kind: "seat_payment_failed" }
  | { kind: "seat_payment_needs_action" }
  | { kind: "billing_owner_only" }
  | { kind: "seat_charge_in_app"; hint: string }
  | { kind: "quote_changed"; quote: SeatQuote };

/**
 * What the AI Manager tells the person when an add it made needs a paid seat:
 * the manager never pays for one, so the person adds them from People, where
 * the price shows before anything is charged.
 */
export const SEAT_CHARGE_IN_APP_HINT =
  "Every paid seat is in use, so adding this person needs a new paid seat. Ask the person to add them from People in Admin, where they will see the price before anything is charged.";

/** The seat refusal behind a failed add, or null for every other error. */
export function seatAddRefusal(error: unknown): SeatAddRefusal | null {
  if (!(error instanceof Error)) return null;
  const code = refusalCode(error);
  if (code === null || !Object.hasOwn(SEAT_ADD_REFUSALS, code)) return null;
  const refusal = code as SeatAddRefusal;
  return SEAT_ADD_REFUSALS[refusal] === refusalStatus(error) ? refusal : null;
}

/**
 * Says what adding one more person to this space would cost.
 *
 * Owners only. A yearly organization with every paid seat in use answers
 * `charge`: the amount charged to the card on file right away, for the time
 * left until the plan renews on `renewsAt`, and the `prorationDate` to pass to
 * addOrgMember. `free_seat` means a paid seat is unused, so the add costs
 * nothing; `billing_owner_only` means only the person who pays can add a seat;
 * `next_invoice` (monthly) means the next bill covers the new seat at
 * `seatPriceCents` a month; `no_charge` means nothing to pay.
 * @assistant group:org
 * @assistant unconfirmed: it only reads a price; nothing is charged and nobody is added.
 */
export async function quoteSeat(scope: HttpScope): Promise<SeatQuote> {
  const res = await httpRequest(scope, "/v1/org/members/quote", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return parseSeatQuote(await res.json());
}

/**
 * Invites someone to this space with the role the user chooses.
 *
 * On a yearly organization with every paid seat in use, this charges the card
 * on file for one more seat: quote it first with quoteSeat, show the person
 * the amount, and pass the quote's `prorationDate` and `amountCents`. Answers
 * `added`, or a state where nobody was added and nothing was charged:
 * `seat_payment_failed` (the card was declined), `seat_payment_needs_action`
 * (the bank wants to confirm the payment), `billing_owner_only` (only the
 * person who pays can add a seat), `seat_charge_in_app` (the AI Manager never
 * pays for a seat: tell the person to add them from People, where they will
 * see the price), or `quote_changed` with the new quote to show before asking
 * again. Adding into a free paid seat, or on a monthly plan, needs no quote.
 * Every other failure throws.
 * @param email The person's email address, as they gave it.
 * @param role What they may do in the space.
 * @param prorationDate The `prorationDate` of the `charge` quote the person
 *   agreed to; omitted when the quote charges nothing.
 * @param quotedAmountCents The `amountCents` of that same quote, so the
 *   gateway charges only the amount shown; sent only with `prorationDate`.
 * @assistant group:org
 * @assistant confirm: outward. It invites a real person into the space, where they can see and drive the agents in it, and it may charge the card on file for their seat.
 */
export async function addOrgMember(
  scope: HttpScope,
  email: string,
  role: OrgRole,
  prorationDate?: number,
  quotedAmountCents?: number,
): Promise<AddOrgMemberOutcome> {
  // The amount only ever travels with the date it was quoted at.
  if (prorationDate === undefined) quotedAmountCents = undefined;
  try {
    const res = await httpRequest(scope, "/v1/org/members", {
      method: "POST",
      body: JSON.stringify({ email, role, prorationDate, quotedAmountCents }),
    });
    return { kind: "added", member: (await res.json()) as AddOrgMemberResult };
  } catch (err) {
    const refusal = seatAddRefusal(err);
    if (refusal === null) throw err;
    if (refusal === "seat_quote_changed" || refusal === "seat_quote_expired") {
      return { kind: "quote_changed", quote: await quoteSeat(scope) };
    }
    if (refusal === "seat_charge_in_app")
      return { kind: refusal, hint: SEAT_CHARGE_IN_APP_HINT };
    return { kind: refusal };
  }
}
