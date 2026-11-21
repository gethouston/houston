import type { BillingChoiceSave } from "./choice";
import { type ChoiceDone, choiceDone } from "./choice-done";
import {
  type ChoiceIntroPage,
  choiceIntroPages,
  leadsToPicker,
} from "./choice-flow";
import type {
  AnnouncedChoice,
  ChoiceModal,
  ShownChoiceModal,
} from "./choice-modal";
import type { PickerState } from "./choice-picker";

export type ChoiceModalPhase =
  | { step: "intro"; page: ChoiceIntroPage }
  | { step: "picking" }
  | { step: "done"; done: ChoiceDone };

export type ChoiceFrameHold = "none" | "until_answer" | "behind_dialog";

export interface ChoiceModalFrame {
  open: boolean;
  shown: ShownChoiceModal | null;
  phase: ChoiceModalPhase;
  hold: ChoiceFrameHold;
  pick: PickerState | null;
}

const INTRO: ChoiceModalPhase = { step: "intro", page: "notice" };

export const CLOSED_CHOICE_FRAME: ChoiceModalFrame = {
  open: false,
  shown: null,
  phase: INTRO,
  hold: "none",
  pick: null,
};

export function nextChoiceModalFrame(
  frame: ChoiceModalFrame,
  modal: ChoiceModal,
): ChoiceModalFrame {
  if (frame.phase.step === "done" && (frame.open || frame.hold !== "none"))
    return doneFrame(frame, modal);
  if (!modal.open) {
    if (!frame.open) return frame;
    if (frame.phase.step === "picking" && !modal.behindDialog)
      return frame.hold === "until_answer"
        ? frame
        : { ...frame, hold: "until_answer" };
    return { ...frame, open: false, hold: "none" };
  }
  if (
    frame.open &&
    frame.shown?.notice.kind === "confirm" &&
    modal.notice.kind === "applied"
  )
    return frame.hold === "until_answer"
      ? frame
      : { ...frame, hold: "until_answer" };
  const phase = frame.open ? carried(frame.phase, modal.notice) : INTRO;
  const unchanged =
    frame.open &&
    frame.hold === "none" &&
    phase === frame.phase &&
    frame.shown !== null &&
    frame.shown.close === modal.close &&
    sameNotice(frame.shown.notice, modal.notice);
  if (unchanged) return frame;
  const pick = frame.open ? frame.pick : null;
  return { open: true, shown: modal, phase, hold: "none", pick };
}

function carried(
  phase: ChoiceModalPhase,
  notice: AnnouncedChoice,
): ChoiceModalPhase {
  if (phase.step === "picking") return leadsToPicker(notice) ? phase : INTRO;
  if (phase.step === "intro" && choiceIntroPages(notice).includes(phase.page))
    return phase;
  return INTRO;
}

function doneFrame(
  frame: ChoiceModalFrame,
  modal: ChoiceModal,
): ChoiceModalFrame {
  const behind = !modal.open && modal.behindDialog;
  if (frame.open)
    return behind ? { ...frame, open: false, hold: "behind_dialog" } : frame;
  return behind ? frame : { ...frame, open: true, hold: "none" };
}

export function finishConfirming(
  frame: ChoiceModalFrame,
  outcome: BillingChoiceSave,
): { frame: ChoiceModalFrame; closed: boolean } {
  if (
    outcome.kind !== "saved" ||
    !frame.open ||
    frame.shown?.notice.kind !== "confirm"
  )
    return { frame, closed: false };
  return { frame: closeChoiceFrame(frame), closed: true };
}

export function closeDismisses(frame: ChoiceModalFrame): boolean {
  return frame.shown?.close === "everywhere";
}

export function finishPicking(
  frame: ChoiceModalFrame,
  outcome: BillingChoiceSave,
): ChoiceModalFrame {
  if (!frame.open || frame.phase.step !== "picking") return frame;
  if (outcome.kind !== "saved")
    return frame.hold === "until_answer"
      ? { ...frame, open: false, hold: "none" }
      : frame;
  const done = choiceDone(outcome.choice);
  if (!done) return frame;
  return { ...frame, phase: { step: "done", done }, hold: "none" };
}

export function closeChoiceFrame(frame: ChoiceModalFrame): ChoiceModalFrame {
  return frame.open ? { ...frame, open: false, hold: "none" } : frame;
}

function sameNotice(a: AnnouncedChoice, b: AnnouncedChoice): boolean {
  const left: Record<string, unknown> = a;
  const right: Record<string, unknown> = b;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => left[key] === right[key])
  );
}
