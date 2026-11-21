import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { academyProgressKey } from "../../../hooks/use-academy-progress";
import { useSession } from "../../../hooks/use-session";
import { saveLessonPositionLive } from "../../../lib/academy/academy-ports";
import { logAndReportError } from "../../../lib/error-report";

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
