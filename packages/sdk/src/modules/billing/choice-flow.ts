import type { BillingChoice } from "@houston/wire-types";
import type { AnnouncedChoice } from "./choice-modal";
import {
  type PickerState,
  type PickerStep,
  pickHasPaidStep,
} from "./choice-picker";

/**
 * A page the modal shows before its picker. `notice`: the notice's own page
 * (what changes, the cutover's pick to confirm, the applied pick). `not_kept`:
 * what happens to the orgs an owner who has to pick does not keep free.
 */
export type ChoiceIntroPage = "notice" | "not_kept";

/** A notice whose intro leads on to the picker. */
export function leadsToPicker(notice: AnnouncedChoice): boolean {
  return notice.kind === "pick" || notice.kind === "confirm";
}

/** The intro pages a notice shows, in order. Never empty. */
export function choiceIntroPages(
  notice: AnnouncedChoice,
): readonly ChoiceIntroPage[] {
  return notice.kind === "pick" ? ["notice", "not_kept"] : ["notice"];
}

/**
 * The pages a pick runs through: `intro` pages counted into its progress (the
 * pick notice's; none when the picker opens from Settings or from the
 * cutover's pick to confirm), then the picker's steps (a payer's `paid`, then
 * `free`), then the success step. `payer` is false once the gateway refused
 * the paid pick, whatever the cached choice still says.
 */
export interface PickFlow {
  intro: number;
  payer: boolean;
}

/**
 * The flow for the picker, after `notice`'s intro or on its own (null), over
 * the picker's draft (null before the person changes it).
 */
export function pickFlow(
  choice: BillingChoice,
  notice: AnnouncedChoice | null,
  pick: PickerState | null,
): PickFlow {
  return {
    intro: notice?.kind === "pick" ? choiceIntroPages(notice).length : 0,
    payer: pickHasPaidStep(choice, pick),
  };
}

/** A page of a {@link PickFlow}: the n-th intro page (0-based), a picker step, or done. */
export type PickFlowAt =
  | { step: "intro"; index: number }
  | { step: PickerStep }
  | { step: "done" };

export interface FlowProgress {
  /** 1-based. */
  current: number;
  total: number;
}

/**
 * Where a page sits in its flow, success step included, or null for a flow
 * whose only page before the success step is the picker: one step needs no
 * progress.
 */
export function pickFlowProgress(
  flow: PickFlow,
  at: PickFlowAt,
): FlowProgress | null {
  const steps = flow.payer ? 2 : 1;
  const total = flow.intro + steps + 1;
  if (total - 1 < 2) return null;
  switch (at.step) {
    case "intro":
      return { current: at.index + 1, total };
    case "done":
      return { current: total, total };
    case "paid":
      return { current: flow.intro + 1, total };
    case "free":
      return { current: flow.intro + steps, total };
  }
}
