import type { BillingChoice } from "@houston/wire-types";
import {
  type ChoiceIntroPage,
  choiceIntroPages,
  type FlowProgress,
  leadsToPicker,
  pickFlow,
  pickFlowProgress,
} from "./choice-flow";
import type { AnnouncedChoice } from "./choice-modal";
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
 * Where an intro page sits in the pick's progress, or null for any notice
 * but `pick`: a one-page notice shows no progress.
 */
export function choiceIntroProgress(
  choice: BillingChoice,
  notice: AnnouncedChoice,
  page: ChoiceIntroPage,
): FlowProgress | null {
  if (notice.kind !== "pick") return null;
  const index = choiceIntroPages(notice).indexOf(page);
  if (index < 0) return null;
  return pickFlowProgress(pickFlow(choice, notice), { step: "intro", index });
}
