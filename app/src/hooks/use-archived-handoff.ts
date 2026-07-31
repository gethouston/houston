import { useCallback } from "react";
import { useUIStore } from "../stores/ui";

interface ArchivedHandoffOptions {
  /** The open archived mission's id, or null when none is open. */
  missionId: string | null;
  /** Drops the archived surface's own selection (the mission is leaving it). */
  onReactivated: () => void;
  /**
   * Points the shell at the board the mission is landing on, before the panel
   * opens. The per-agent Archived tab flips its board back to `active`; the
   * cross-agent Mission Control view makes the mission's agent current.
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
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);

  const handoff = useCallback(
    (id: string) => {
      onReactivated();
      focusBoard();
      setViewMode("activity");
      setActivityPanelId(id, { forceOpen: true });
    },
    [onReactivated, focusBoard, setViewMode, setActivityPanelId],
  );

  const onSendReactivated = useCallback(() => {
    if (missionId) handoff(missionId);
  }, [missionId, handoff]);

  return { handoff, onSendReactivated };
}
