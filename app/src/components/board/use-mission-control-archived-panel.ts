import { useCallback } from "react";
import { useArchivedHandoff } from "../../hooks/use-archived-handoff";
import { useOpenAgentHref } from "../../hooks/use-open-agent-file";
import { modelAcceptsImages } from "../../lib/providers";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useLatchedMissionAgent } from "./use-latched-mission-agent";
import type { useMissionControlArchived } from "./use-mission-control-archived";
import { useMissionControlArchivedSend } from "./use-mission-control-archived-send";

type ArchivedData = ReturnType<typeof useMissionControlArchived>;

/**
 * The chat half of the cross-agent Archived view: the panel for the selected
 * archived mission, the send that RE-ACTIVATES it, and the handoff that then
 * carries the user back to this screen's ACTIVE board so the conversation stays
 * in view. One unit because they are one story, and every piece of it needs the
 * panel's effective provider/model (which is why the data hook stays data-only).
 *
 * Independent of how the list is scoped or searched: this hook only ever sees
 * the ONE selected mission.
 */
export function useMissionControlArchivedPanel(
  data: ArchivedData,
  /** Swap the archive out for the board it belongs to — the global one, or the
   *  team's. The re-activated mission lands there, and only the active board
   *  consumes the published target. */
  onShowActive: () => void,
) {
  const { selectedItem, activeAgent } = data;

  const clearSelection = useCallback(() => data.setSelectedId(null), [data]);
  // The mission's agent, captured while it is still LISTED: the handoff fires
  // after a send that re-activates the mission, by which point this list has
  // refetched without it (see `useLatchedMissionAgent`). It only makes the
  // agent CURRENT — the destination is this screen's own board.
  const focusMissionAgent = useLatchedMissionAgent(
    data.selectedId,
    activeAgent,
  );
  const focusBoard = useCallback(() => {
    focusMissionAgent();
    onShowActive();
  }, [focusMissionAgent, onShowActive]);
  const { handoff, onSendReactivated } = useArchivedHandoff({
    missionId: data.selectedId,
    onReactivated: clearSelection,
    focusBoard,
  });

  const panel = useAgentChatPanel({
    agent: activeAgent,
    selectedSessionKey: data.selectedSessionKey,
    onSelectSession: data.setSelectedId,
    onSendReactivated,
  });
  const attachmentValidation = useAttachmentRejectionDialog({
    modelAcceptsImages: modelAcceptsImages(
      panel.effectiveProvider,
      panel.effectiveModel,
    ),
  });
  const openHref = useOpenAgentHref(activeAgent?.folderPath ?? null);
  const onSendMessage = useMissionControlArchivedSend({
    activeAgent,
    selectedItem,
    providerOverride: panel.effectiveProvider,
    modelOverride: panel.effectiveModel,
    onHandoff: handoff,
  });

  return { panel, attachmentValidation, openHref, onSendMessage };
}
