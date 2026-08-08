import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { RUNNING_STATUS } from "../lib/mission-selection";
import type { RawConversation } from "../lib/tauri";
import { useUIStore } from "../stores/ui";

interface ArchivedHandoffOptions {
  /** The open archived mission's id, or null when none is open. */
  missionId: string | null;
  /** Drops the archived surface's own selection (the mission is leaving it). */
  onReactivated: () => void;
  /**
   * Puts the ACTIVE board of this surface back on screen, before the panel
   * opens: the archive and its board are two surfaces of the same screen, and
   * only the active one consumes the published mission.
   */
  focusBoard: () => void;
}

interface ArchivedHandoff {
  /** Run the handoff for an explicit mission id (the composer send path knows
   *  which mission it sent to, even mid-teardown). */
  handoff: (missionId: string) => void;
  /** The chat panel's `onSendReactivated`: same handoff, for the OPEN mission. */
  onSendReactivated: () => void;
}

/**
 * The archived → active handoff, shared by BOTH archived surfaces.
 *
 * Every send inside an archived chat re-activates its mission — the engine
 * flips `archived → running` on session start — so the mission silently leaves
 * the archived list. Whoever caused the send has to move the user with it, or
 * they are left staring at a list the conversation just fell out of.
 *
 * TWO paths reach here, and both must, or the seam leaks:
 *  - the plain composer, through each surface's own `onSendMessage` hook;
 *  - every send `useAgentChatPanel` owns — the offers a finished mission keeps
 *    (suggested-action bubbles, a completed stepper, an accepted
 *    save-as-reusable card, a plan-ready choice) AND a Skill submitted into the
 *    open conversation — which report back through its `onSendReactivated`.
 */
export function useArchivedHandoff({
  missionId,
  onReactivated,
  focusBoard,
}: ArchivedHandoffOptions): ArchivedHandoff {
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);
  const queryClient = useQueryClient();

  const handoff = useCallback(
    (id: string) => {
      // Say out loud that the mission left the archive, in the shared sweep
      // rows, BEFORE anything is published. This is not an optimistic guess:
      // the send already landed and the engine flips `archived → running` at
      // turn start — the rows are simply the last to hear, since they only
      // refresh on the turn's event. And they are exactly what decides which
      // SURFACE a published target belongs to (`lib/board-surface-nav.ts`), so
      // handing off with a stale `archived` row bounces the user straight back
      // into the archive the mission just fell out of, onto an empty list with
      // a dead panel over it.
      queryClient.setQueriesData<RawConversation[]>(
        { queryKey: ["all-conversations"] },
        (rows) =>
          rows?.map((c) =>
            c.id === id ? { ...c, status: RUNNING_STATUS } : c,
          ),
      );
      onReactivated();
      // Back to the board this archive belongs to — the global one, or the
      // team's — never a jump to some other screen: the user came from here.
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
