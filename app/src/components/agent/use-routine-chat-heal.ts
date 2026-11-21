import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { logger } from "../../lib/logger";
import { queryKeys } from "../../lib/query-keys";
import {
  findRoutineChatHeal,
  type RoutineChatHeal,
} from "../../lib/routine-chat-setup";
import { tauriActivity, tauriRoutines } from "../../lib/tauri";

interface HealActivity {
  id: string;
  agent?: string | null;
  routine_id?: string;
}
interface HealRoutine {
  id: string;
  setup_activity_id?: string | null;
}

export function useRoutineChatHeal(
  rawItems: HealActivity[] | undefined,
  routines: HealRoutine[] | undefined,
  path: string,
  queryClient: QueryClient,
): void {
  const healingRef = useRef(false);
  useEffect(() => {
    if (healingRef.current) return;
    const heal: RoutineChatHeal | null = findRoutineChatHeal(
      rawItems,
      routines,
    );
    if (!heal) return;
    healingRef.current = true;
    const apply =
      heal.kind === "stamp_activity"
        ? tauriActivity
            .update(path, heal.activityId, { routine_id: heal.routineId })
            .then(() =>
              queryClient.invalidateQueries({
                queryKey: queryKeys.activity(path),
              }),
            )
        : tauriRoutines
            .update(path, heal.routineId, {
              setup_activity_id: heal.activityId,
            })
            .then(() =>
              queryClient.invalidateQueries({
                queryKey: queryKeys.routines(path),
              }),
            );
    apply
      .catch((err) =>
        logger.error(`[routine-chat] link heal (${heal.kind}) failed: ${err}`),
      )
      .finally(() => {
        healingRef.current = false;
      });
  }, [rawItems, routines, path, queryClient]);
}
