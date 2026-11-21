import type { OrgBilling, OrgRole } from "@houston/engine-adapter";
import {
  type AddOrgMemberOutcome,
  type ChargeSeatQuote,
  type SeatQuote,
  seatAddedNote,
  seatAddStep,
} from "@houston/sdk";
import { type AddOutcome, describeAddResult } from "./people-tab-model";

export type ChargePhase = "ask" | "paying" | "declined" | "needs_action";

export interface ChargeDialog {
  email: string;
  role: OrgRole;
  quote: ChargeSeatQuote;
  phase: ChargePhase;
  portalOpened: boolean;
}

export function chargeDialog(
  email: string,
  role: OrgRole,
  quote: ChargeSeatQuote,
): ChargeDialog {
  return { email, role, quote, phase: "ask", portalOpened: false };
}

export type SeatFlowNext =
  | { kind: "done"; outcome: AddOutcome }
  | { kind: "dialog"; dialog: ChargeDialog }
  | { kind: "resend"; quote: SeatQuote }
  | { kind: "closed" };

export function afterAdd(input: {
  email: string;
  role: OrgRole;
  quote: SeatQuote;
  billing: OrgBilling | null | undefined;
  outcome: AddOrgMemberOutcome;
  dialog: ChargeDialog | null;
  purchasable: boolean;
}): SeatFlowNext {
  const { outcome, dialog } = input;
  switch (outcome.kind) {
    case "added":
      return {
        kind: "done",
        outcome: describeAddResult(
          input.email,
          outcome.member,
          seatAddedNote(input.quote, input.billing),
        ),
      };
    case "seat_payment_failed":
      return dialog
        ? { kind: "dialog", dialog: { ...dialog, phase: "declined" } }
        : { kind: "closed" };
    case "seat_payment_needs_action":
      return dialog
        ? { kind: "dialog", dialog: { ...dialog, phase: "needs_action" } }
        : { kind: "closed" };
    case "billing_owner_only":
    case "seat_charge_in_app":
      return { kind: "closed" };
    case "quote_changed": {
      const step = seatAddStep(outcome.quote);
      if (step.kind === "confirm_charge")
        return input.purchasable
          ? {
              kind: "dialog",
              dialog: chargeDialog(input.email, input.role, step.quote),
            }
          : { kind: "closed" };
      if (step.kind === "add" && dialog)
        return { kind: "resend", quote: outcome.quote };
      return { kind: "closed" };
    }
  }
}
