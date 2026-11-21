import { useCallback } from "react";
import { useArchivedHandoff } from "../../hooks/use-archived-handoff";
import { modelAcceptsImages } from "../../lib/providers";
import { useAttachmentRejectionDialog } from "../attachment-rejection-dialog";
import { useAgentChatPanel } from "../use-agent-chat-panel";
import { useLatchedMissionAgent } from "./use-latched-mission-agent";
import type { useMissionControlArchived } from "./use-mission-control-archived";
import { useMissionControlArchivedSend } from "./use-mission-control-archived-send";

type ArchivedData = ReturnType<typeof useMissionControlArchived>;

export function useMissionControlArchivedPanel(
  data: ArchivedData,
  onShowActive: () => void,
) {
  const { selectedItem, activeAgent } = data;

  const clearSelection = useCallback(() => data.setSelectedId(null), [data]);
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
  const openHref = panel.openHref;
  const onSendMessage = useMissionControlArchivedSend({
    activeAgent,
    selectedItem,
    resolveSendPin: panel.resolveSendPin,
    turnMode: panel.turnMode,
    onHandoff: handoff,
  });

  return { panel, attachmentValidation, openHref, onSendMessage };
}
