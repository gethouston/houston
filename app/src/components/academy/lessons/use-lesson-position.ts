import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { academyProgressKey } from "../../../hooks/use-academy-progress";
import { useSession } from "../../../hooks/use-session";
import { saveLessonPositionLive } from "../../../lib/academy/academy-ports";
import { logAndReportError } from "../../../lib/error-report";

/**
 * Keeps the beat a run just reached, so leaving the lesson (Exit, Escape) is a
 * pause the path offers to Continue.
 *
 * Written on ARRIVAL at every beat rather than on the way out: a run can end
 * without any exit path running at all (a closed window, a crash), and the
 * place kept must survive that too. The progress query is refreshed once the
 * write lands, because the Academy screen is kept alive rather than remounted
 * and would otherwise keep offering Start on a lesson the user already began.
 */
export function useLessonPosition(): (lessonId: string, index: number) => void {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const uid = session?.uid ?? null;

  return useCallback(
    (lessonId: string, index: number) => {
      saveLessonPositionLive(uid, lessonId, index)
        .then(() => qc.invalidateQueries({ queryKey: academyProgressKey(uid) }))
        .catch((e: unknown) => logAndReportError("academy_lesson_position", e));
    },
    [qc, uid],
  );
}
