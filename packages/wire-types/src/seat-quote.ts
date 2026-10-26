import { z } from "zod";
import { reportUnreadableWire } from "./unreadable-wire";

const instant = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "expected an ISO date",
});
const count = z.number().int().nonnegative();
const cents = z.number().int().nonnegative();

/**
 * What adding one more person to the active org costs, answered by
 * `POST /v1/org/members/quote` (body `{}`) before the add:
 * - `charge`: a yearly org with every paid seat in use, asked by the person
 *   who pays. One more seat is charged now, `amountCents` for the time left
 *   until `renewsAt`. The add sends `prorationDate` and `quotedAmountCents`
 *   back so the charge is the one quoted.
 * - `free_seat`: a yearly org with a paid seat nobody uses; no charge.
 * - `billing_owner_only`: a yearly org with every paid seat in use, asked by
 *   someone who does not pay. Only the payer, `billingOwnerName` when the
 *   gateway knows it, can add a seat.
 * - `next_invoice`: a monthly org; the next bill covers the new seat at
 *   `seatPriceCents` a month.
 * - `no_charge`: nothing to say (a free org, a comp grant).
 */
export const seatQuoteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("charge"),
    amountCents: cents,
    currency: z.string(),
    prorationDate: z.number().int().positive(),
    paidSeats: count,
    seatsInUse: count,
    renewsAt: instant,
  }),
  z.object({
    kind: z.literal("free_seat"),
    paidSeats: count,
    seatsInUse: count,
  }),
  z.object({
    kind: z.literal("billing_owner_only"),
    paidSeats: count,
    seatsInUse: count,
    // An older gateway omits it; a value this client cannot read names nobody.
    billingOwnerName: z
      .string()
      .nullable()
      .optional()
      .catch(({ error }) => {
        reportUnreadableWire("seat_quote_owner_name_unreadable", error);
        return null;
      })
      .transform((name) => name ?? null),
  }),
  z.object({ kind: z.literal("next_invoice"), seatPriceCents: cents }),
  z.object({ kind: z.literal("no_charge") }),
]);
export type SeatQuote = z.infer<typeof seatQuoteSchema>;
export type SeatQuoteKind = SeatQuote["kind"];
export type ChargeSeatQuote = Extract<SeatQuote, { kind: "charge" }>;

/**
 * A quote off the wire. A kind a later gateway adds, or a shape this client
 * cannot read, is `no_charge`: the add then sends no `prorationDate`, so the
 * gateway never charges an amount this client did not show, and refuses the
 * add (`seat_quote_changed`) if it needs one. The fallback is reported.
 */
export function parseSeatQuote(value: unknown): SeatQuote {
  const parsed = seatQuoteSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  reportUnreadableWire("seat_quote_unreadable", parsed.error);
  return { kind: "no_charge" };
}

/**
 * The refusals `POST /v1/org/members` answers for a seat it would add, with
 * their status. Nobody is added and nothing is charged on any of them:
 * - `seat_payment_failed`: the card was declined;
 * - `seat_payment_needs_action`: the bank wants to confirm the payment (3DS),
 *   which a background charge cannot do;
 * - `seat_quote_changed`: the add needs a charge but carried no valid
 *   `prorationDate`, or the charge no longer matches `quotedAmountCents`;
 * - `seat_quote_expired`: the quote is too old;
 * - `billing_owner_only`: every paid seat is in use and the caller does not pay;
 * - `seat_charge_in_app`: the add needs a charge and comes from the AI
 *   Manager, which never pays for a seat; the person adds them from People,
 *   where they see the price.
 */
export const SEAT_ADD_REFUSALS = {
  seat_payment_failed: 402,
  seat_payment_needs_action: 402,
  seat_quote_changed: 409,
  seat_quote_expired: 409,
  billing_owner_only: 403,
  seat_charge_in_app: 403,
} as const;
export type SeatAddRefusal = keyof typeof SEAT_ADD_REFUSALS;

/** A seat count, or null for one an older gateway omits or this client cannot read. */
const seatCount = (field: string) =>
  count
    .nullable()
    .optional()
    .catch(({ error }) => {
      reportUnreadableWire(`org_billing_${field}_unreadable`, error);
      return null;
    });

/**
 * The `OrgBilling` fields a live yearly subscription adds: the seats it paid
 * for and the seats in use. Null on every other org; an older gateway omits
 * them.
 */
export const seatCountFields = {
  paidSeats: seatCount("paid_seats"),
  seatsInUse: seatCount("seats_in_use"),
};
