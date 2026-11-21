import type { BillingChoice, BillingChoicePick } from "@houston/wire-types";
import type { BillingChoiceSave } from "./choice";
import { choosesPaidOrg, pickerRows } from "./choice-model";

export function defaultPaidOrg(choice: BillingChoice): string | null {
  const stored = choice.orgs.find((org) => org.slug === choice.paidOrgSlug);
  return stored?.slug ?? pickerRows(choice)[0]?.org.slug ?? null;
}

export function defaultFreeOrg(
  choice: BillingChoice,
  paidOrgSlug: string | null,
): string | null {
  const rows = pickerRows(choice).filter((row) => row.org.slug !== paidOrgSlug);
  const stored = rows.find((row) => row.org.slug === choice.freeOrgSlug);
  return (stored ?? rows[0])?.org.slug ?? null;
}

export type PickerStep = "paid" | "free";

export interface PickerState {
  step: PickerStep;
  free: string | null;
  paid: string | null;
  paidRefused: boolean;
}

export function startPick(choice: BillingChoice): PickerState {
  if (!choosesPaidOrg(choice))
    return {
      step: "free",
      free: defaultFreeOrg(choice, null),
      paid: null,
      paidRefused: false,
    };
  return {
    step: "paid",
    free: null,
    paid: defaultPaidOrg(choice),
    paidRefused: false,
  };
}

export function toFreeStep(
  choice: BillingChoice,
  state: PickerState,
): PickerState {
  const free =
    state.free !== null && state.free !== state.paid
      ? state.free
      : defaultFreeOrg(choice, state.paid);
  return { ...state, step: "free", free };
}

export function pickHasPaidStep(
  choice: BillingChoice,
  state: PickerState | null,
): boolean {
  return choosesPaidOrg(choice) && !state?.paidRefused;
}

export function reconcilePick(
  choice: BillingChoice,
  state: PickerState,
): PickerState {
  const owned = (slug: string | null) =>
    slug !== null && choice.orgs.some((org) => org.slug === slug);
  const free = owned(state.free) ? state.free : null;
  const { paidRefused } = state;
  if (!pickHasPaidStep(choice, state))
    return {
      step: "free",
      free: free ?? defaultFreeOrg(choice, null),
      paid: null,
      paidRefused,
    };
  if (!owned(state.paid))
    return { step: "paid", free, paid: defaultPaidOrg(choice), paidRefused };
  if (state.step === "paid")
    return { step: "paid", free, paid: state.paid, paidRefused };
  return {
    step: "free",
    free:
      free !== null && free !== state.paid
        ? free
        : defaultFreeOrg(choice, state.paid),
    paid: state.paid,
    paidRefused,
  };
}

export function pickRefused(
  state: PickerState,
  outcome: BillingChoiceSave,
): PickerState {
  return outcome.kind === "not_payer"
    ? { ...state, step: "free", paid: null, paidRefused: true }
    : state;
}

export function pickerBack(state: PickerState): PickerState | null {
  return state.step === "free" && state.paid
    ? { ...state, step: "paid" }
    : null;
}

export function pickerSubmission(state: PickerState): BillingChoicePick | null {
  if (state.step !== "free" || !state.free) return null;
  return state.paid
    ? { freeOrgSlug: state.free, paidOrgSlug: state.paid }
    : { freeOrgSlug: state.free };
}

export function nextChoiceDeadline(
  choice: BillingChoice | null | undefined,
  now: number,
): number | null {
  if (!choice) return null;
  const upcoming = [choice.changeableUntil, choice.cutoverAt]
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value) - now)
    .filter((ms) => ms > 0);
  return upcoming.length ? Math.min(...upcoming) : null;
}
