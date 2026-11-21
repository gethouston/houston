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

export function inviteSendable(invite: {
  status: string;
  error?: string;
}): boolean {
  if (invite.status === "pending") return true;
  return invite.status === "failed" && inviteSeatRefusal(invite.error) === null;
}
