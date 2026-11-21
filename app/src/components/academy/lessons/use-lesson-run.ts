import { useCallback, useEffect, useRef, useState } from "react";
import { lessonAdvance } from "../../../lib/academy/lesson-signals";
import {
  type LessonSpec,
  type LessonStepSpec,
  lessonBeatView,
} from "../../../lib/academy/lesson-spec";
import { analytics } from "../../../lib/analytics";
import { fireMissionDoneConfetti } from "../../../lib/confetti";
import { openComposeBoard } from "../../../lib/open-agent";
import { AGENT_VIEW_ID } from "../../../lib/top-level-views";
import { useUIStore } from "../../../stores/ui";
import { lessonBeatArmed, lessonExitKey } from "./lesson-arming";
import { useLessonAward } from "./use-lesson-award";
import { useLessonPosition } from "./use-lesson-position";
import { useLessonSignals } from "./use-lesson-signals";

const LESSON_SOURCE = "academy_path";

function navigateToLessonView(viewId: string): void {
  if (viewId === AGENT_VIEW_ID) {
    openComposeBoard();
    return;
  }
  useUIStore.getState().setViewMode(viewId);
}

export interface LessonRun {
  step: LessonStepSpec | undefined;
  index: number;
  armed: boolean;
  next: () => void;
  companionReady: () => void;
  exit: () => void;
}

export function useLessonRun(spec: LessonSpec, startIndex: number): LessonRun {
  const setActiveLessonId = useUIStore((s) => s.setActiveLessonId);
  const award = useLessonAward();
  const keepPosition = useLessonPosition();
  const [index, setIndex] = useState(startIndex);
  const step = spec.steps[index];
  const { signals, companionReady } = useLessonSignals(step);
  const finished = useRef(false);

  const lessonId = spec.id;
  const chapterId = spec.chapterId;
  useEffect(() => {
    analytics.track("academy_lesson_started", {
      lesson: lessonId,
      chapter: chapterId,
      source: LESSON_SOURCE,
    });
  }, [lessonId, chapterId]);

  const opened = useRef(false);
  useEffect(() => {
    const arrival = opened.current ? "advance" : "open";
    opened.current = true;
    const view = lessonBeatView(spec, index, arrival);
    if (view !== null) navigateToLessonView(view);
  }, [spec, index]);

  useEffect(() => {
    keepPosition(lessonId, index);
  }, [lessonId, index, keepPosition]);

  const next = useCallback(() => {
    if (finished.current) return;
    if (index < spec.steps.length - 1) {
      setIndex(index + 1);
      return;
    }
    finished.current = true;
    award(spec);
    fireMissionDoneConfetti();
    setActiveLessonId(null);
  }, [spec, index, award, setActiveLessonId]);

  useEffect(() => {
    if (step === undefined) return;
    if (lessonAdvance(step, signals).kind === "advance") next();
  }, [step, signals, next]);

  const exit = useCallback(() => {
    setActiveLessonId(null);
  }, [setActiveLessonId]);

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
    companionReady,
    exit,
  };
}
