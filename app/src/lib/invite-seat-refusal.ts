/**
 * The seat answers an email invite (share via team, a team move) can get on a
 * yearly org with every paid seat in use. Those flows show no price, so they
 * never buy a seat: the person adds them from People, or asks whoever pays.
 * Sending again cannot change any of these, so no retry is offered.
 */
export const INVITE_SEAT_REFUSALS = [
  "quote_changed",
  "billing_owner_only",
  "seat_charge_in_app",
] as const;
export type InviteSeatRefusal = (typeof INVITE_SEAT_REFUSALS)[number];

export function inviteSeatRefusal(
  error: string | undefined,
): InviteSeatRefusal | null {
  return INVITE_SEAT_REFUSALS.find((code) => code === error) ?? null;
}

/** Whether an invite row goes out on the next send: new, or a retryable failure. */
export function inviteSendable(invite: {
  status: string;
  error?: string;
}): boolean {
  if (invite.status === "pending") return true;
  return invite.status === "failed" && inviteSeatRefusal(invite.error) === null;
}
