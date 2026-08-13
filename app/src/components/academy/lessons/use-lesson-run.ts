import { useCallback, useEffect, useRef, useState } from "react";
import { lessonAdvance } from "../../../lib/academy/lesson-signals";
import type {
  LessonSpec,
  LessonStepSpec,
} from "../../../lib/academy/lesson-spec";
import { analytics } from "../../../lib/analytics";
import { fireMissionDoneConfetti } from "../../../lib/confetti";
import { openHome } from "../../../lib/home-nav";
import { TEAM_VIEW_ID } from "../../../lib/top-level-views";
import { useUIStore } from "../../../stores/ui";
import { lessonBeatArmed, lessonExitKey } from "./lesson-arming";
import { useLessonAward } from "./use-lesson-award";
import { useLessonSignals } from "./use-lesson-signals";

/**
 * Where a run was armed from, for the funnel. One value while the Academy is
 * the only place lessons will be offered from; a second entry point is a
 * second value, passed in rather than assumed here.
 */
const LESSON_SOURCE = "academy_path";

/**
 * Put the user where a beat's target lives.
 *
 * A team view is never set by id alone: which team and which of its sections
 * is open is store state, so `openHome` — the ONE writer of a whole team view
 * — takes that id and lands on the first team's Mission Control (the Inbox
 * when no team has resolved). Everything else is a plain top-level view.
 */
function navigateToLessonView(viewId: string): void {
  if (viewId === TEAM_VIEW_ID) {
    openHome();
    return;
  }
  useUIStore.getState().setViewMode(viewId);
}

export interface LessonRun {
  step: LessonStepSpec | undefined;
  /** Which beat is up, 0-based. The beat's counter is drawn from it. */
  index: number;
  /**
   * Whether the beat may hand over the control it points at yet
   * ({@link lessonBeatArmed}). False keeps the veil whole, so the taught click
   * cannot happen in the window where the beat would not see it.
   */
  armed: boolean;
  /** The narration beats' own button: moves on, or finishes the lesson. */
  next: () => void;
  /** Leave. A lesson is always abandonable — nothing is kept, nothing is paid. */
  exit: () => void;
}

/**
 * Playing a lesson: which beat is up, what arms with it, and what finishing
 * means.
 *
 * The advance DECISION is not here — it is the pure `lessonAdvance` over the
 * world `useLessonSignals` reads, mirroring how the guided setup splits its
 * machine from its wiring. This hook only carries out what the decision says:
 * the beat move, the navigation a beat asks for when it arms, the funnel
 * events, and the finish (the award, the nod, the overlay clearing itself).
 *
 * One run per mount: `LessonRunner` is keyed by the lesson id, so arming a
 * different lesson starts from its first beat with a clean world.
 */
export function useLessonRun(spec: LessonSpec | undefined): LessonRun {
  const setActiveLessonId = useUIStore((s) => s.setActiveLessonId);
  const award = useLessonAward();
  const [index, setIndex] = useState(0);
  const step = spec?.steps[index];
  const signals = useLessonSignals(step);
  // The finish is terminal and pays real experience, so it is armed once. The
  // overlay unmounts on the same act, but a signal that stays true through
  // that commit must not be able to pay a second time.
  const finished = useRef(false);

  // One started event per run, tagged with where it was armed from.
  const lessonId = spec?.id;
  const chapterId = spec?.chapterId;
  useEffect(() => {
    if (lessonId === undefined || chapterId === undefined) return;
    analytics.track("academy_lesson_started", {
      lesson: lessonId,
      chapter: chapterId,
      source: LESSON_SOURCE,
    });
  }, [lessonId, chapterId]);

  // A beat that needs the user somewhere takes them there as it arms, before
  // the wait begins — the spotlight keeps polling, so the hole opens the
  // moment the anchor renders on the new screen.
  const navigateTo =
    step?.kind === "spotlight" ? (step.navigate?.viewId ?? null) : null;
  useEffect(() => {
    if (navigateTo !== null) navigateToLessonView(navigateTo);
  }, [navigateTo]);

  const next = useCallback(() => {
    if (spec === undefined || finished.current) return;
    if (index < spec.steps.length - 1) {
      setIndex(index + 1);
      return;
    }
    // The last beat cleared: pay it, nod at it, and hand the shell back.
    finished.current = true;
    award(spec);
    fireMissionDoneConfetti();
    setActiveLessonId(null);
  }, [spec, index, award, setActiveLessonId]);

  // The world said the taught action happened.
  useEffect(() => {
    if (step === undefined) return;
    if (lessonAdvance(step, signals).kind === "advance") next();
  }, [step, signals, next]);

  const exit = useCallback(() => {
    setActiveLessonId(null);
  }, [setActiveLessonId]);

  // Escape leaves the lesson, on every beat. The overlay stands over the app
  // without inerting it, so the key has to be taken here rather than left to a
  // dialog primitive, and the whisper beat has no keyboard path to its close
  // at all. Capture, so the key that ends the lesson is not also read as
  // "close this" by whatever the lesson is standing on — and trusted-only
  // (`lessonExitKey`), so the app's own synthetic Escapes cannot end the run.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!lessonExitKey(event)) return;
      event.preventDefault();
      event.stopPropagation();
      exit();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [exit]);

  return {
    step,
    index,
    armed: step !== undefined && lessonBeatArmed(step, signals),
    next,
    exit,
  };
}
