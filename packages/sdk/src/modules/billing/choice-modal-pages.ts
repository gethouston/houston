import { choiceIntroPages, leadsToPicker } from "./choice-flow";
import type { ChoiceModalFrame } from "./choice-modal-frame";

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
