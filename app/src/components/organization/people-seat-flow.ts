import type { OrgBilling, OrgRole } from "@houston/engine-adapter";
import {
  type AddOrgMemberOutcome,
  type ChargeSeatQuote,
  type SeatQuote,
  seatAddedNote,
  seatAddStep,
} from "@houston/sdk";
import { type AddOutcome, describeAddResult } from "./people-tab-model";

/**
 * Pure, DOM-free state for the add-someone seat flow on the People tab: the
 * charge dialog's phases and what the screen shows after each add outcome.
 * What a quote means (ask first, add, or stop) is the SDK's `seatAddStep`;
 * this module only places its answer on screen.
 */

/**
 * The charge dialog: asking, charging, or showing why nothing was added (a
 * declined card, or a bank that wants to confirm the payment).
 */
export type ChargePhase = "ask" | "paying" | "declined" | "needs_action";

export interface ChargeDialog {
  email: string;
  role: OrgRole;
  quote: ChargeSeatQuote;
  phase: ChargePhase;
  /** The billing portal opened from the refusal, so the copy says so. */
  portalOpened: boolean;
}

export function chargeDialog(
  email: string,
  role: OrgRole,
  quote: ChargeSeatQuote,
): ChargeDialog {
  return { email, role, quote, phase: "ask", portalOpened: false };
}

/**
 * Where the screen goes after an add answered: the person is in (`done`, with
 * the line to show), the dialog stays up in a new phase or with a new quote
 * (`dialog`), or it closes with nobody added while the note under the form
 * re-reads the quote (`closed`).
 */
export type SeatFlowNext =
  | { kind: "done"; outcome: AddOutcome }
  | { kind: "dialog"; dialog: ChargeDialog }
  | { kind: "closed" };

export function afterAdd(input: {
  email: string;
  role: OrgRole;
  /** The quote the add was sent under. */
  quote: SeatQuote;
  billing: OrgBilling | null | undefined;
  outcome: AddOrgMemberOutcome;
  dialog: ChargeDialog | null;
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
      return { kind: "closed" };
    case "quote_changed": {
      const step = seatAddStep(outcome.quote);
      return step.kind === "confirm_charge"
        ? {
            kind: "dialog",
            dialog: chargeDialog(input.email, input.role, step.quote),
          }
        : { kind: "closed" };
    }
  }
}
