import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";
import type { BillingChoiceSave } from "./choice";
import { canChangeChoice, choosesPaidOrg, pickerRows } from "./choice-model";

/**
 * What an owned org becomes at the cutover. `free`: the pick. `subscription`:
 * the payer's subscription pays for it. `locks`: the cutover scheduled its
 * lock, on the org's `lockAt`. `needs_plan`: everything else.
 */
export type ChoiceOrgStatus = "free" | "subscription" | "locks" | "needs_plan";

export interface ChoiceDoneOrg {
  org: BillingChoiceOrg;
  status: ChoiceOrgStatus;
}

/** What the picker's success step shows once a pick is stored. */
export interface ChoiceDone {
  free: BillingChoiceOrg;
  /** The org the payer's subscription pays for, else null. */
  paid: BillingChoiceOrg | null;
  /**
   * The cutover already applied this pick: each org shows what it is now,
   * and `changeableUntil` is when the pick stops changing.
   */
  applied: boolean;
  changeableUntil: string | null;
  /**
   * The cutover instant. The surface formats it when it renders
   * ({@link formatCutoverDate}), so a language change reaches an open step.
   */
  cutoverAt: string;
  /** Every org the person owns, in the picker's order. */
  orgs: ChoiceDoneOrg[];
}

/** The success step for a stored choice, or null if it holds no free pick. */
export function choiceDone(saved: BillingChoice): ChoiceDone | null {
  const free = saved.orgs.find((org) => org.slug === saved.freeOrgSlug);
  if (!free) return null;
  // A paid org on the record means nothing without a subscription to move.
  const paid = choosesPaidOrg(saved)
    ? (saved.orgs.find((org) => org.slug === saved.paidOrgSlug) ?? null)
    : null;
  const status = (org: BillingChoiceOrg): ChoiceOrgStatus => {
    if (org.slug === free.slug) return "free";
    if (org.slug === paid?.slug) return "subscription";
    return org.lockAt ? "locks" : "needs_plan";
  };
  const applied = saved.state === "applied";
  return {
    free,
    paid,
    applied,
    changeableUntil: applied ? saved.changeableUntil : null,
    cutoverAt: saved.cutoverAt,
    orgs: pickerRows(saved).map(({ org }) => ({ org, status: status(org) })),
  };
}

/**
 * The free-org picker opened on its own (Settings > Billing): the picker,
 * then its success step once a save is stored, until the person closes it.
 * A closed frame keeps `done` so the success step stays through the close
 * animation.
 */
export interface ChoicePickerFrame {
  open: boolean;
  done: ChoiceDone | null;
}

export const CLOSED_CHOICE_PICKER: ChoicePickerFrame = {
  open: false,
  done: null,
};

/** Opens on the picker, never on a success step left from the last open. */
export function openChoicePicker(): ChoicePickerFrame {
  return { open: true, done: null };
}

/** Closed by the person: the X, Escape, a click outside or Done. */
export function closeChoicePicker(frame: ChoicePickerFrame): ChoicePickerFrame {
  return frame.open ? { ...frame, open: false } : frame;
}

/**
 * The frame after a save answers. Only a stored pick moves to the success
 * step; a refusal keeps the picker, which shows the refusal's own copy.
 */
export function choicePickerSaved(
  frame: ChoicePickerFrame,
  outcome: BillingChoiceSave,
): ChoicePickerFrame {
  if (!frame.open || frame.done || outcome.kind !== "saved") return frame;
  const done = choiceDone(outcome.choice);
  return done ? { open: true, done } : frame;
}

/**
 * What Settings > Billing shows for the pick. `row`: the entry that opens the
 * picker, while the pick may still change ({@link canChangeChoice}). `frame`:
 * the window closed while the picker or its success step was open, so only
 * that frame stays, until the person closes it; a save just before the
 * deadline keeps its confirmation. `none`: nothing.
 */
export type ChoicePickerEntry = "row" | "frame" | "none";

export function choicePickerEntry(
  choice: BillingChoice | null | undefined,
  now: number,
  frame: ChoicePickerFrame,
): ChoicePickerEntry {
  if (!choice) return "none";
  if (canChangeChoice(choice, now)) return "row";
  return frame.open ? "frame" : "none";
}
