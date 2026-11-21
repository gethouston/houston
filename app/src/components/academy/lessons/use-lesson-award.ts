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
