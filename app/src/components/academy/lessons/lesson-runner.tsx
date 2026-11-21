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

export function LessonRunner({ lessonId }: { lessonId: string }) {
  const setActiveLessonId = useUIStore((s) => s.setActiveLessonId);
  const spec = academyLesson(lessonId);
  const progress = useAcademyProgress();

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

function LessonPlayer(props: { spec: LessonSpec; startIndex: number }) {
  const { spec } = props;
  const run = useLessonRun(spec, props.startIndex);
  const step = run.step;
  if (step === undefined) return null;

  return <LessonBeat spec={spec} step={step} run={run} />;
}

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
