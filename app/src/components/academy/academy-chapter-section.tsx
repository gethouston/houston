import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { type AcademyNodeState, AcademyPathNode } from "./academy-path-node";
import type {
  ChapterPath,
  LessonPathEntry,
  LessonPathState,
} from "./academy-path-state";
import { lessonPathAction } from "./academy-path-state";
import { lessonText } from "./lessons/lesson-copy";

/**
 * One chapter on the path: its name, how much of it is done, and its lessons,
 * each with the one thing to do about it (Start, Continue or Replay).
 *
 * Starting and continuing are the same act, arming the lesson: the runner
 * reads where the user left it (`lessonStartIndex`), so the path never has to
 * say which beat to open on and can never say a different one.
 */
export function AcademyChapterSection(props: { chapter: ChapterPath }) {
  const { t } = useTranslation("academy");
  const { chapter } = props;
  const titleId = `academy-chapter-${chapter.id}`;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 pr-2 pl-1">
        <h3 id={titleId} className="text-sm font-medium text-ink-muted">
          {t(`chapters.${chapter.id}.title`)}
        </h3>
        <span className="text-xs text-ink-muted tabular-nums">
          {chapter.finished
            ? t("path.chapterDone")
            : t("path.chapterProgress", {
                done: chapter.finishedCount,
                total: chapter.lessons.length,
              })}
        </span>
      </div>
      <ol className="flex flex-col">
        {chapter.lessons.map((entry, index) => (
          <LessonNode
            key={entry.lesson.id}
            entry={entry}
            last={index === chapter.lessons.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

const NODE_STATE: Record<LessonPathState["kind"], AcademyNodeState> = {
  new: "available",
  started: "started",
  finished: "completed",
};

function LessonNode(props: { entry: LessonPathEntry; last: boolean }) {
  const { t } = useTranslation("academy");
  const setActiveLessonId = useUIStore((s) => s.setActiveLessonId);
  const { lesson, state } = props.entry;
  const action = lessonPathAction(state);
  return (
    <AcademyPathNode
      state={NODE_STATE[state.kind]}
      title={lessonText(t, lesson.id, "title")}
      description={lessonText(t, lesson.id, "description")}
      chip={lessonChip(t, state, lesson.steps.length)}
      action={{
        label: t(`actions.${action}`),
        onClick: () => setActiveLessonId(lesson.id),
      }}
      last={props.last}
    />
  );
}

/** Experience banked on a finished lesson; the beat a started one resumes on. */
function lessonChip(
  t: TFunction<"academy">,
  state: LessonPathState,
  total: number,
): string | undefined {
  switch (state.kind) {
    case "new":
      return undefined;
    case "started":
      return t("lessons.progress", { current: state.resumeIndex + 1, total });
    case "finished":
      return t("path.earned", { points: state.experience });
  }
}
