import type { BillingChoice } from "@houston/wire-types";
import {
  type ChoiceIntroPage,
  choiceIntroPages,
  type FlowProgress,
  leadsToPicker,
  type PickFlow,
  pickFlow,
  pickFlowProgress,
} from "./choice-flow";
import type { ChoiceModalFrame } from "./choice-modal-frame";
import { type PickerState, reconcilePick, startPick } from "./choice-picker";

export function nextChoicePage(frame: ChoiceModalFrame): ChoiceModalFrame {
  const { phase, shown } = frame;
  if (!frame.open || phase.step !== "intro" || !shown) return frame;
  const pages = choiceIntroPages(shown.notice);
  const following = pages[pages.indexOf(phase.page) + 1];
  if (following) return { ...frame, phase: { step: "intro", page: following } };
  return leadsToPicker(shown.notice)
    ? { ...frame, phase: { step: "picking" } }
    : frame;
}

export function previousChoicePage(frame: ChoiceModalFrame): ChoiceModalFrame {
  const { phase, shown } = frame;
  if (!frame.open || !shown || phase.step === "done") return frame;
  const pages = choiceIntroPages(shown.notice);
  const at =
    phase.step === "picking" ? pages.length : pages.indexOf(phase.page);
  const previous = pages[at - 1];
  return previous
    ? { ...frame, phase: { step: "intro", page: previous } }
    : frame;
}

export function choiceFramePick(
  frame: ChoiceModalFrame,
  choice: BillingChoice,
): PickerState {
  return reconcilePick(choice, frame.pick ?? startPick(choice));
}

export function withChoicePick(
  frame: ChoiceModalFrame,
  pick: PickerState,
): ChoiceModalFrame {
  return { ...frame, pick };
}

export function choiceFrameFlow(
  frame: ChoiceModalFrame,
  choice: BillingChoice,
): PickFlow {
  return pickFlow(choice, frame.shown?.notice ?? null, frame.pick);
}

export function choiceIntroProgress(
  frame: ChoiceModalFrame,
  choice: BillingChoice,
  page: ChoiceIntroPage,
): FlowProgress | null {
  const notice = frame.shown?.notice;
  if (notice?.kind !== "pick") return null;
  const index = choiceIntroPages(notice).indexOf(page);
  if (index < 0) return null;
  return pickFlowProgress(choiceFrameFlow(frame, choice), {
    step: "intro",
    index,
  });
}
