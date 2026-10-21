import type { BillingChoiceSave } from "./choice";
import { type ChoiceDone, choiceDone } from "./choice-done";
import type {
  AnnouncedChoice,
  ChoiceModal,
  ShownChoiceModal,
} from "./choice-modal";

/**
 * Which step the modal's frame shows: the intro, the picker (only ever while
 * the notice is `pick` or `confirm`), or the success step after a stored pick.
 */
export type ChoiceModalPhase =
  | { step: "intro" }
  | { step: "picking" }
  | { step: "done"; done: ChoiceDone };

/**
 * What keeps the frame's step past the modal. `none`: the frame follows the
 * modal. `until_answer`: the modal closed under an open picker, or a `confirm`
 * notice turned `applied` under the frame, as the stored pick's cache write
 * does before or after the save's own answer lands; the step stays until
 * {@link finishPicking}, {@link finishConfirming} or a close settles it.
 * `behind_dialog`: a plan dialog hides the success step, which shows again
 * once that dialog is gone.
 */
export type ChoiceFrameHold = "none" | "until_answer" | "behind_dialog";

/**
 * What the pricing-change modal's frame shows, carried from one render to the
 * next. `shown` is the last open modal: it keeps the frame's content through
 * the close animation, after the notice itself has gone.
 */
export interface ChoiceModalFrame {
  open: boolean;
  shown: ShownChoiceModal | null;
  phase: ChoiceModalPhase;
  hold: ChoiceFrameHold;
}

const INTRO: ChoiceModalPhase = { step: "intro" };

export const CLOSED_CHOICE_FRAME: ChoiceModalFrame = {
  open: false,
  shown: null,
  phase: INTRO,
  hold: "none",
};

/**
 * The frame for the latest {@link ChoiceModal}. It reopens on the intro, so a
 * modal hidden behind a plan dialog comes back where it started; a notice that
 * stops being a pick (a refusal's refetch shows the person cannot pick) drops
 * the picker. A modal that closes for any other reason than a plan dialog
 * leaves an open picker open (`until_answer`). An open success step ignores
 * the modal, which a stored pick closes, except to step aside for a plan
 * dialog; only the person closes it ({@link closeChoiceFrame}). Answers
 * `frame` itself when nothing changed, so a surface that stores the frame can
 * tell when to store it again.
 */
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
  // A stored change or confirmation can turn `confirm` into `applied` before
  // the save's own answer lands; the frame waits for that answer
  // ({@link finishPicking}, {@link finishConfirming}) as if the modal closed,
  // so the read-only note never flashes in its place.
  if (
    frame.open &&
    frame.shown?.notice.kind === "confirm" &&
    modal.notice.kind === "applied"
  )
    return frame.hold === "until_answer"
      ? frame
      : { ...frame, hold: "until_answer" };
  const picking =
    frame.open && frame.phase.step === "picking" && picks(modal.notice);
  const unchanged =
    frame.open &&
    frame.hold === "none" &&
    picking === (frame.phase.step === "picking") &&
    frame.shown !== null &&
    frame.shown.close === modal.close &&
    sameNotice(frame.shown.notice, modal.notice);
  if (unchanged) return frame;
  return {
    open: true,
    shown: modal,
    phase: picking ? frame.phase : INTRO,
    hold: "none",
  };
}

/** A success step the person has not closed: it only steps aside. */
function doneFrame(
  frame: ChoiceModalFrame,
  modal: ChoiceModal,
): ChoiceModalFrame {
  const behind = !modal.open && modal.behindDialog;
  if (frame.open)
    return behind ? { ...frame, open: false, hold: "behind_dialog" } : frame;
  return behind ? frame : { ...frame, open: true, hold: "none" };
}

/** The frame once the person asks to pick; unchanged unless a pick is open. */
export function startPicking(frame: ChoiceModalFrame): ChoiceModalFrame {
  if (
    !frame.open ||
    frame.phase.step !== "intro" ||
    !frame.shown ||
    !picks(frame.shown.notice)
  )
    return frame;
  return { ...frame, phase: { step: "picking" } };
}

/** A notice whose intro leads on to the picker. */
function picks(notice: AnnouncedChoice): boolean {
  return notice.kind === "pick" || notice.kind === "confirm";
}

/**
 * The frame after Confirm on a `confirm` intro answers, and whether the
 * notice is now settled for good (`dismiss`: store the dismissal, so no device
 * asks again). A stored pick closes the frame; a refusal keeps it, which shows
 * the refusal's own copy.
 */
export function finishConfirming(
  frame: ChoiceModalFrame,
  outcome: BillingChoiceSave,
): { frame: ChoiceModalFrame; dismiss: boolean } {
  if (
    outcome.kind !== "saved" ||
    !frame.open ||
    frame.shown?.notice.kind !== "confirm"
  )
    return { frame, dismiss: false };
  return { frame: closeChoiceFrame(frame), dismiss: true };
}

/**
 * Whether closing the frame stores the dismissal on the server: a read-only
 * notice (`everywhere`), or a `confirm` notice the person settled by saving a
 * new pick, so its success step is the last they see of it.
 */
export function closeDismisses(frame: ChoiceModalFrame): boolean {
  if (!frame.shown) return false;
  if (frame.shown.close === "everywhere") return true;
  return frame.shown.notice.kind === "confirm" && frame.phase.step === "done";
}

/**
 * The frame after a save answers. A stored pick moves an open picker to the
 * success step; a refusal keeps the picker, which shows the refusal's own
 * copy, and never reaches the success step. A refusal for a picker the modal
 * closed under closes it: the notice no longer asks.
 */
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

/**
 * The frame once the person closes it: the X, Escape, a click outside, or a
 * button. It keeps its content through the close animation; whether it may
 * open again is the modal's call (a closed session, a stored pick).
 */
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
