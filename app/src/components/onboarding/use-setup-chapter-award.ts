import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { academyProgressKey } from "../../hooks/use-academy-progress";
import { useSession } from "../../hooks/use-session";
import { completeSetupChapterLive } from "../../lib/academy/academy-ports";
import { SETUP_CHAPTER_ID } from "../../lib/academy/academy-ranks";
import { analytics } from "../../lib/analytics";

/** Which run earned the chapter, matching the onboarding funnel's own tagging. */
export type SetupChapterSource = "in_app" | "in_app_replay";

/**
 * Pays the Academy's first chapter for finishing the guided setup.
 *
 * Called from the flow's ONE terminal path ({@link
 * import("./use-in-app-onboarding").useInAppOnboarding}'s `finish`) rather than
 * from the reveal card's button: the reward is earned by finishing the setup,
 * so it can never hang on which control ended the run. The award itself is
 * idempotent (`completeSetupChapterLive`), which is what lets a replay take the
 * same path without paying twice or moving the completion date.
 *
 * Non-blocking on purpose: the setup hands the shell back immediately and the
 * progress query is refreshed once the write lands, so the Academy screen shows
 * the new experience even when it was already mounted (kept-alive screens never
 * remount, and nothing else would tell it a chapter was cleared).
 */
export function useSetupChapterAward(): (source: SetupChapterSource) => void {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const uid = session?.uid ?? null;

  return useCallback(
    (source: SetupChapterSource) => {
      analytics.track("academy_chapter_completed", {
        chapter: SETUP_CHAPTER_ID,
        source,
      });
      completeSetupChapterLive(uid)
        .then(() => qc.invalidateQueries({ queryKey: academyProgressKey(uid) }))
        .catch((e) => {
          console.error("[academy] setup chapter award failed", e);
        });
    },
    [qc, uid],
  );
}
