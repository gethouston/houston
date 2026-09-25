import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { academyProgressKey } from "../../../hooks/use-academy-progress";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useSession } from "../../../hooks/use-session";
import { writeFinishedChapter } from "../../../lib/academy/academy-chapters";
import { completeLessonLive } from "../../../lib/academy/academy-ports";
import type { LessonSpec } from "../../../lib/academy/lesson-spec";
import { analytics } from "../../../lib/analytics";
import { logAndReportError } from "../../../lib/error-report";
import { chapterLessonIds } from "./registry";

/**
 * Pays a lesson the user just finished: the funnel event, the idempotent write,
 * and the progress query refreshed once the write lands. The write that
 * finishes a chapter's last lesson also reports the chapter
 * (`academy_chapter_completed`), exactly once: a replay finishes nothing new.
 * The chapter's lessons are the ones the path shows here, so a lesson this
 * deployment cannot teach never keeps it open.
 *
 * Non-blocking on purpose. The lesson hands the shell back the instant the last
 * beat clears, and the Academy screen is kept alive rather than remounted, so
 * the invalidation is the only thing that would ever tell it new experience was
 * earned.
 */
export function useLessonAward(): (lesson: LessonSpec) => void {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const uid = session?.uid ?? null;
  const { capabilities } = useCapabilities();

  return useCallback(
    (lesson: LessonSpec) => {
      analytics.track("academy_lesson_completed", {
        lesson: lesson.id,
        chapter: lesson.chapterId,
      });
      completeLessonLive(uid, lesson.id, lesson.experience)
        .then(({ before, after }) => {
          const lessonIds = chapterLessonIds(lesson.chapterId, capabilities);
          if (writeFinishedChapter(before, after, lessonIds))
            analytics.track("academy_chapter_completed", {
              chapter: lesson.chapterId,
            });
          return qc.invalidateQueries({ queryKey: academyProgressKey(uid) });
        })
        .catch((e: unknown) => logAndReportError("academy_lesson_award", e));
    },
    [qc, uid, capabilities],
  );
}
