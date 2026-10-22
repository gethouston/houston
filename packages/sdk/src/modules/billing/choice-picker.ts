import type { BillingChoice, BillingChoicePick } from "@houston/wire-types";
import type { BillingChoiceSave } from "./choice";
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
 * The picker's state made valid against the latest choice. A refusal's
 * refetch can drop an org the person no longer owns or end their payer
 * status. A dropped paid org goes back to the paid step on the busiest org; a
 * dropped free org alone goes back to the free step on its default. Without a
 * subscription, or after the gateway refused one ({@link pickRefused}), only
 * the free step is left. The paid step keeps any free pick still owned, even
 * the org now picked as paid: {@link toFreeStep} settles that collision.
 */
export function reconcilePick(
  choice: BillingChoice,
  state: PickerState,
): PickerState {
  const owned = (slug: string | null) =>
    slug !== null && choice.orgs.some((org) => org.slug === slug);
  const free = owned(state.free) ? state.free : null;
  if (!choosesPaidOrg(choice) || (state.step === "free" && !state.paid))
    return {
      step: "free",
      free: free ?? defaultFreeOrg(choice, null),
      paid: null,
    };
  if (!owned(state.paid))
    return { step: "paid", free, paid: defaultPaidOrg(choice) };
  if (state.step === "paid") return { step: "paid", free, paid: state.paid };
  return {
    step: "free",
    free:
      free !== null && free !== state.paid
        ? free
        : defaultFreeOrg(choice, state.paid),
    paid: state.paid,
  };
}

/**
 * The picker after a save answers. `not_payer` means the gateway holds no
 * subscription for the person, so the paid pick goes and the free step stays,
 * even while the choice still names them a payer: resending the pair would be
 * refused again.
 */
export function pickRefused(
  state: PickerState,
  outcome: BillingChoiceSave,
): PickerState {
  return outcome.kind === "not_payer"
    ? { ...state, step: "free", paid: null }
    : state;
}

/** Back inside the picker: a payer's free step returns to the paid one; null leaves the picker. */
export function pickerBack(state: PickerState): PickerState | null {
  return state.step === "free" && state.paid
    ? { ...state, step: "paid" }
    : null;
}

/** What the free step's confirm sends, or null with no free pick. */
export function pickerSubmission(state: PickerState): BillingChoicePick | null {
  if (state.step !== "free" || !state.free) return null;
  return state.paid
    ? { freeOrgSlug: state.free, paidOrgSlug: state.paid }
    : { freeOrgSlug: state.free };
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
