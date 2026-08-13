import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { academyProgressKey } from "../../../hooks/use-academy-progress";
import { useSession } from "../../../hooks/use-session";
import { completeLessonLive } from "../../../lib/academy/academy-ports";
import type { LessonSpec } from "../../../lib/academy/lesson-spec";
import { analytics } from "../../../lib/analytics";

/**
 * Pays a lesson the user just finished, the same shape the setup chapter's
 * award has ({@link import("../../onboarding/use-setup-chapter-award").useSetupChapterAward}):
 * the funnel event, the idempotent write, and the progress query refreshed once
 * the write lands.
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

  return useCallback(
    (lesson: LessonSpec) => {
      analytics.track("academy_lesson_completed", {
        lesson: lesson.id,
        chapter: lesson.chapterId,
      });
      completeLessonLive(uid, lesson.id, lesson.experience)
        .then(() => qc.invalidateQueries({ queryKey: academyProgressKey(uid) }))
        .catch((e) => {
          console.error("[academy] lesson award failed", e);
        });
    },
    [qc, uid],
  );
}
