import { z } from "zod";
import { reportUnreadableWire } from "./unreadable-wire";

const instant = z.string().refine((v) => Number.isFinite(Date.parse(v)), {
  message: "expected an ISO date",
});
const count = z.number().int().nonnegative();
const cents = z.number().int().nonnegative();

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

export function parseSeatQuote(value: unknown): SeatQuote {
  const parsed = seatQuoteSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  reportUnreadableWire("seat_quote_unreadable", parsed.error);
  return { kind: "no_charge" };
}

export const SEAT_ADD_REFUSALS = {
  seat_payment_failed: 402,
  seat_payment_needs_action: 402,
  seat_quote_changed: 409,
  seat_quote_expired: 409,
  billing_owner_only: 403,
  seat_charge_in_app: 403,
} as const;
export type SeatAddRefusal = keyof typeof SEAT_ADD_REFUSALS;

const seatCount = (field: string) =>
  count
    .nullable()
    .optional()
    .catch(({ error }) => {
      reportUnreadableWire(`org_billing_${field}_unreadable`, error);
      return null;
    });

export const seatCountFields = {
  paidSeats: seatCount("paid_seats"),
  seatsInUse: seatCount("seats_in_use"),
};
