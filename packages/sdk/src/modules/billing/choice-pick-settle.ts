import type { BillingChoice } from "@houston/wire-types";
import type { PickerState } from "./choice-picker";

/**
 * A draft settled against the latest choice. A refused paid pick
 * ({@link pickRefused}) holds while the choice still names a Plus or comp
 * payer: the refusal's refetch can lag, and resending the pair would be
 * refused again. A choice naming neither confirms the refusal, which then
 * goes, so a subscription that starts again in the same open (another tab, a
 * comp grant) brings the paid step back. Only the payer counts, never the org
 * count {@link choosesPaidOrg} also reads: a dropped org confirms nothing.
 * Answers `state` itself when nothing changes.
 */
export function settlePick(
  state: PickerState,
  choice: BillingChoice,
): PickerState {
  const subscribes = choice.payer === "plus" || choice.payer === "comp";
  return state.paidRefused && !subscribes
    ? { ...state, paidRefused: false }
    : state;
}

/**
 * A frame, the modal's or the Settings picker's, with its draft settled
 * ({@link settlePick}). A surface derives it on every render and stores it
 * when it changes: a payer, then none, then a payer again with no click in
 * between must still end on the paid step, so the clear cannot live in a
 * read alone. Answers `frame` itself when nothing changes.
 */
export function settleChoicePick<Frame extends { pick: PickerState | null }>(
  frame: Frame,
  choice: BillingChoice,
): Frame {
  if (!frame.pick) return frame;
  const pick = settlePick(frame.pick, choice);
  return pick === frame.pick ? frame : { ...frame, pick };
}
