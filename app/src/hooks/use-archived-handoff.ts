import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { RawConversation } from "../lib/conversations-facade";
import { RUNNING_STATUS } from "../lib/mission-selection";
import { useUIStore } from "../stores/ui";

interface ArchivedHandoffOptions {
  missionId: string | null;
  onReactivated: () => void;
  focusBoard: () => void;
}

interface ArchivedHandoff {
  handoff: (missionId: string) => void;
  onSendReactivated: () => void;
}

export function useArchivedHandoff({
  missionId,
  onReactivated,
  focusBoard,
}: ArchivedHandoffOptions): ArchivedHandoff {
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);
  const queryClient = useQueryClient();

  const handoff = useCallback(
    (id: string) => {
      queryClient.setQueriesData<RawConversation[]>(
        { queryKey: ["all-conversations"] },
        (rows) =>
          rows?.map((c) =>
            c.id === id ? { ...c, status: RUNNING_STATUS } : c,
          ),
      );
      onReactivated();
      focusBoard();
      setActivityPanelId(id, { forceOpen: true });
    },
    [onReactivated, focusBoard, setActivityPanelId, queryClient],
  );

  const onSendReactivated = useCallback(() => {
    if (missionId) handoff(missionId);
  }, [missionId, handoff]);

  return { handoff, onSendReactivated };
}
