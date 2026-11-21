import type { BillingChoice } from "@houston/wire-types";
import type { AnnouncedChoice } from "./choice-modal";
import {
  type PickerState,
  type PickerStep,
  pickHasPaidStep,
} from "./choice-picker";

export type ChoiceIntroPage = "notice" | "not_kept";

export function leadsToPicker(notice: AnnouncedChoice): boolean {
  return notice.kind === "pick" || notice.kind === "confirm";
}

export function choiceIntroPages(
  notice: AnnouncedChoice,
): readonly ChoiceIntroPage[] {
  return notice.kind === "pick" ? ["notice", "not_kept"] : ["notice"];
}

export interface PickFlow {
  intro: number;
  payer: boolean;
}

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

export type PickFlowAt =
  | { step: "intro"; index: number }
  | { step: PickerStep }
  | { step: "done" };

export interface FlowProgress {
  current: number;
  total: number;
}

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
