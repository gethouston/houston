import type { BillingChoice } from "@houston/wire-types";
import { choosesPaidOrg, pickerRows } from "./choice-model";

/** The org a payer's subscription starts on: the stored paid org, else the busiest. */
export function defaultPaidOrg(choice: BillingChoice): string | null {
  const stored = choice.orgs.find((org) => org.slug === choice.paidOrgSlug);
  return stored?.slug ?? pickerRows(choice)[0]?.org.slug ?? null;
}

/**
 * The org the free step starts on: the stored pick, else the busiest, never
 * the org the subscription covers.
 */
export function defaultFreeOrg(
  choice: BillingChoice,
  paidOrgSlug: string | null,
): string | null {
  const rows = pickerRows(choice).filter((row) => row.org.slug !== paidOrgSlug);
  const stored = rows.find((row) => row.org.slug === choice.freeOrgSlug);
  return (stored ?? rows[0])?.org.slug ?? null;
}

/** A payer picks the org their subscription covers, then the free one. */
export type PickerStep = "paid" | "free";

export interface PickerState {
  step: PickerStep;
  free: string | null;
  paid: string | null;
}

/** The picker as it opens: a payer on the paid step, everyone else on the free one. */
export function startPick(choice: BillingChoice): PickerState {
  if (!choosesPaidOrg(choice))
    return { step: "free", free: defaultFreeOrg(choice, null), paid: null };
  return { step: "paid", free: null, paid: defaultPaidOrg(choice) };
}

/**
 * The free step after a payer's paid pick: the free pick they had, unless it
 * is now the paid org, else the default.
 */
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

/**
 * The picker's state made valid against the latest choice. A refetch after a
 * refusal can drop an org the person no longer owns or end their payer
 * status. A dropped paid org goes back to the paid step on the busiest org; a
 * dropped free org alone goes back to the free step on its default. Without a
 * subscription the paid pick goes and only the free step is left. Never
 * resubmits what the gateway just refused.
 */
export function reconcilePick(
  choice: BillingChoice,
  state: PickerState,
): PickerState {
  const owned = (slug: string | null) =>
    slug !== null && choice.orgs.some((org) => org.slug === slug);
  if (!choosesPaidOrg(choice))
    return {
      step: "free",
      free: owned(state.free) ? state.free : defaultFreeOrg(choice, null),
      paid: null,
    };
  const freeOk = (paid: string | null) =>
    owned(state.free) && state.free !== paid ? state.free : null;
  if (!owned(state.paid)) {
    const paid = defaultPaidOrg(choice);
    return { step: "paid", free: freeOk(paid), paid };
  }
  if (state.step === "paid")
    return { step: "paid", free: freeOk(state.paid), paid: state.paid };
  return {
    step: "free",
    free: freeOk(state.paid) ?? defaultFreeOrg(choice, state.paid),
    paid: state.paid,
  };
}

/**
 * Milliseconds until the notice next changes on its own (the end of the
 * change window, then the cutover), or null once both have passed. A surface
 * re-renders then so an open session never outlives the window.
 */
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
