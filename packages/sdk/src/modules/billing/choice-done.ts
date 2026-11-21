import type { BillingChoice, BillingChoiceOrg } from "@houston/wire-types";
import type { BillingChoiceSave } from "./choice";
import { canChangeChoice, choosesPaidOrg, pickerRows } from "./choice-model";
import { type PickerState, reconcilePick, startPick } from "./choice-picker";

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

export interface ChoiceDone {
  free: BillingChoiceOrg;
  paid: BillingChoiceOrg | null;
  applied: boolean;
  changeableUntil: string | null;
  cutoverAt: string;
  orgs: ChoiceDoneOrg[];
}

export function choiceDone(saved: BillingChoice): ChoiceDone | null {
  const free = saved.orgs.find((org) => org.slug === saved.freeOrgSlug);
  if (!free) return null;
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

export function openChoicePicker(): ChoicePickerFrame {
  return { open: true, done: null, pick: null };
}

export function choicePickerPick(
  frame: ChoicePickerFrame,
  choice: BillingChoice,
): PickerState {
  return reconcilePick(choice, frame.pick ?? startPick(choice));
}

export function withPickerDraft(
  frame: ChoicePickerFrame,
  pick: PickerState,
): ChoicePickerFrame {
  return { ...frame, pick };
}

export function closeChoicePicker(frame: ChoicePickerFrame): ChoicePickerFrame {
  return frame.open ? { ...frame, open: false } : frame;
}

export function choicePickerSaved(
  frame: ChoicePickerFrame,
  outcome: BillingChoiceSave,
): ChoicePickerFrame {
  if (!frame.open || frame.done || outcome.kind !== "saved") return frame;
  const done = choiceDone(outcome.choice);
  return done ? { ...frame, done } : frame;
}

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

export function saveSettlesNotice(outcome: BillingChoiceSave): boolean {
  return (
    outcome.kind === "saved" &&
    outcome.choice.state === "applied" &&
    !outcome.choice.noticeDismissed
  );
}
