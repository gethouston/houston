import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAcademyProgress } from "../../../hooks/use-academy-progress";
import { lessonStartIndex } from "../../../lib/academy/lesson-position";
import type {
  LessonSpec,
  LessonStepSpec,
} from "../../../lib/academy/lesson-spec";
import { academyVideo } from "../../../lib/academy/videos";
import { useUIStore } from "../../../stores/ui";
import { LessonVideoCard } from "../../tutorial";
import { LessonCompanion } from "./lesson-companion";
import { lessonStepText } from "./lesson-copy";
import { LessonDockedPanel } from "./lesson-docked-panel";
import { LessonNoteCard } from "./lesson-note-card";
import { LessonPanel } from "./lesson-panel";
import { lessonStepPosition } from "./lesson-progress";
import { LessonSpotlight } from "./lesson-spotlight";
import { academyLesson } from "./registry";
import { type LessonRun, useLessonRun } from "./use-lesson-run";

/**
 * An Academy lesson, played over the REAL app.
 *
 * One surface at a time, and it is the one the beat lives on: a video, a note
 * or an interactive panel docked over a quieted app, or a whisper beside the
 * control the user must click. Each carries the little it owes the user — where they are
 * and the way out ({@link import("./lesson-beat-chrome").LessonBeatChrome}) —
 * so guidance always rides the thing the eye is already on and a beat can still
 * be a single sentence.
 *
 * Content-agnostic: nothing here knows which lesson is running. Every word is
 * resolved from the `academy` namespace by the lesson's own ids, and the machine
 * that decides when a beat is over is {@link useLessonRun}.
 *
 * Mounted by the workspace shell whenever `activeLessonId` is set, keyed by
 * the id, so exiting is simply clearing that one field.
 *
 * A run opens where the user left the lesson (`lessonStartIndex`), so it waits
 * for the progress record before its first beat: opening on beat one and then
 * jumping would play a beat the user already saw. The record is almost always
 * cached already, because the path that armed the lesson reads it too. A
 * record that cannot be read opens on the first beat rather than holding the
 * lesson hostage to the engine.
 */
export function LessonRunner({ lessonId }: { lessonId: string }) {
  const setActiveLessonId = useUIStore((s) => s.setActiveLessonId);
  const spec = academyLesson(lessonId);
  const progress = useAcademyProgress();

  // An id nothing ships any more (a lesson retired while it was armed) must
  // not leave a dead overlay standing over the app.
  useEffect(() => {
    if (spec === undefined) setActiveLessonId(null);
  }, [spec, setActiveLessonId]);

  if (spec === undefined || progress.loading) return null;
  return (
    <LessonPlayer
      spec={spec}
      startIndex={lessonStartIndex(progress.record, spec)}
    />
  );
}

/** One run of a lesson, from the beat it opens on. Mounted once the start is
 *  known, so the run's first beat is never replaced under the user. */
function LessonPlayer(props: { spec: LessonSpec; startIndex: number }) {
  const { spec } = props;
  const run = useLessonRun(spec, props.startIndex);
  const step = run.step;
  if (step === undefined) return null;

  return <LessonBeat spec={spec} step={step} run={run} />;
}

/**
 * The one beat that is playing. Rendered in the position that beat belongs in —
 * watch it (the concept video) and hear it (the note) dock over a quieted app;
 * do it (the whisper) stands beside the real control, on the app exactly as the
 * user left it.
 */
function LessonBeat({
  spec,
  step,
  run,
}: {
  spec: LessonSpec;
  step: LessonStepSpec;
  run: LessonRun;
}) {
  const { t } = useTranslation("academy");
  const title = lessonStepText(t, spec.id, step.id, "title") ?? "";
  const body = lessonStepText(t, spec.id, step.id, "body");
  const cta = lessonStepText(t, spec.id, step.id, "cta");
  // Where the run stands and the way out, told the same way on whichever
  // surface is up.
  const chrome = {
    position: lessonStepPosition(spec, run.index),
    total: spec.steps.length,
    onExit: run.exit,
  };

  switch (step.kind) {
    case "video":
      return (
        <LessonDockedPanel label={title} {...chrome}>
          <LessonVideoCard
            video={academyVideo(step.videoId)}
            kicker={t("lessons.video.kicker")}
            title={title}
            body={body}
            continueLabel={t("lessons.video.continue")}
            comingSoonLabel={t("lessons.video.comingSoon")}
            onContinue={run.next}
          />
        </LessonDockedPanel>
      );
    case "card":
      return (
        <LessonDockedPanel label={title} {...chrome}>
          <LessonNoteCard
            title={title}
            body={body}
            cta={cta ?? ""}
            onNext={run.next}
          />
        </LessonDockedPanel>
      );
    case "panel":
      return (
        <LessonDockedPanel label={title} {...chrome}>
          <LessonPanel
            panel={step.panel}
            copy={{ title, body: body ?? "", cta }}
            onNext={run.next}
            onExit={run.exit}
          />
        </LessonDockedPanel>
      );
    case "spotlight":
      return (
        <>
          {step.companion && (
            // Keyed by the beat, so each beat's companion starts clean.
            <LessonCompanion
              key={step.id}
              companion={step.companion}
              onNext={run.next}
              onReady={run.companionReady}
            />
          )}
          <LessonSpotlight
            selector={step.target}
            whisper={body}
            armed={run.armed}
            inDialog={step.inDialog}
            action={
              step.advanceOn.type === "acknowledged"
                ? { label: cta ?? "", onClick: run.next }
                : undefined
            }
            {...chrome}
          />
        </>
      );
  }
}
