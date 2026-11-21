import type { BillingChoice } from "@houston/wire-types";
import { namesPayer } from "./choice-model";
import type { PickerState } from "./choice-picker";

export function settlePick(
  state: PickerState,
  choice: BillingChoice,
): PickerState {
  return state.paidRefused && !namesPayer(choice)
    ? { ...state, paidRefused: false }
    : state;
}

export function settleChoicePick<Frame extends { pick: PickerState | null }>(
  frame: Frame,
  choice: BillingChoice,
): Frame {
  if (!frame.pick) return frame;
  const pick = settlePick(frame.pick, choice);
  return pick === frame.pick ? frame : { ...frame, pick };
}
