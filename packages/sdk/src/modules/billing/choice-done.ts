import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";
import type { BillingChoiceSave } from "./choice";
import { canChangeChoice, choosesPaidOrg, pickerRows } from "./choice-model";
import { type PickerState, reconcilePick, startPick } from "./choice-picker";

/**
 * What an owned org becomes at the cutover. `free`: the pick. `subscription`:
 * the payer's subscription pays for it. `locks`: the cutover scheduled its
 * lock, on the org's `lockAt`. `paid`: after the cutover, an org with no lock
 * that is neither of the two pays on its own subscription (a team
 * subscriber's org, a sponsored company org). `needs_plan`: before the
 * cutover, everything else.
 */
export type ChoiceOrgStatus =
  | "free"
  | "subscription"
  | "locks"
  | "paid"
  | "needs_plan";

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
  const applied = saved.state === "applied";
  const status = (org: BillingChoiceOrg): ChoiceOrgStatus => {
    if (org.slug === free.slug) return "free";
    if (org.slug === paid?.slug) return "subscription";
    if (org.lockAt) return "locks";
    return applied ? "paid" : "needs_plan";
  };
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
 * animation. `pick` is the picker's draft for this open, null until the
 * person changes it ({@link choicePickerPick}); it outlives the picker so the
 * success step counts the same steps.
 */
export interface ChoicePickerFrame {
  open: boolean;
  done: ChoiceDone | null;
  pick: PickerState | null;
}

export const CLOSED_CHOICE_PICKER: ChoicePickerFrame = {
  open: false,
  done: null,
  pick: null,
};

/**
 * Opens on the picker from the stored pick, never on a success step or a
 * draft left from the last open.
 */
export function openChoicePicker(): ChoicePickerFrame {
  return { open: true, done: null, pick: null };
}

/** The Settings picker's draft, valid against the latest choice. */
export function choicePickerPick(
  frame: ChoicePickerFrame,
  choice: BillingChoice,
): PickerState {
  return reconcilePick(choice, frame.pick ?? startPick(choice));
}

/** The Settings frame holding the picker's new draft. */
export function withPickerDraft(
  frame: ChoicePickerFrame,
  pick: PickerState,
): ChoicePickerFrame {
  return { ...frame, pick };
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
  return done ? { ...frame, done } : frame;
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

/**
 * Whether a save settles the post-cutover notice for good, so the surface
 * stores the dismissal (`dismissChoiceNotice`) and no device asks again: any
 * pick stored after the cutover applied one, a confirmation or a change, from
 * whichever screen made it. A save before the cutover settles nothing.
 */
export function saveSettlesNotice(outcome: BillingChoiceSave): boolean {
  return (
    outcome.kind === "saved" &&
    outcome.choice.state === "applied" &&
    !outcome.choice.noticeDismissed
  );
}
