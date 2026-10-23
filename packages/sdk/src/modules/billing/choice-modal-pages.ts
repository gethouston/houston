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

/**
 * The frame after Next: the notice's next intro page, then, after the last
 * one, the picker while the notice asks for a pick. Unchanged anywhere else.
 */
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

/**
 * The frame after Back: the previous intro page, or from the picker's first
 * step, the last one. Unchanged on the first page and on the success step.
 */
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

/**
 * The picker's draft in the modal, valid against the latest choice: the
 * stored draft, else where the picker starts ({@link startPick}).
 */
export function choiceFramePick(
  frame: ChoiceModalFrame,
  choice: BillingChoice,
): PickerState {
  return reconcilePick(choice, frame.pick ?? startPick(choice));
}

/** The frame holding the picker's new draft. */
export function withChoicePick(
  frame: ChoiceModalFrame,
  pick: PickerState,
): ChoiceModalFrame {
  return { ...frame, pick };
}

/**
 * The modal's flow: the shown notice's intro, then the picker over the
 * frame's draft, so a refused paid pick drops the paid step from every
 * count, Back and the success step alike.
 */
export function choiceFrameFlow(
  frame: ChoiceModalFrame,
  choice: BillingChoice,
): PickFlow {
  return pickFlow(choice, frame.shown?.notice ?? null, frame.pick);
}

/**
 * Where an intro page of the shown notice sits in the pick's progress, or
 * null for any notice but `pick`: a one-page notice shows no progress.
 */
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
