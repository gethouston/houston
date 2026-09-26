import { AIBoard, type KanbanItem } from "@houston-ai/board";
import { useCallback, useEffect } from "react";
import { openMissionChat } from "../../lib/mission-chat";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useArchivedChatProps } from "../board/use-archived-chat-props";
import { useMissionControlArchived } from "../board/use-mission-control-archived";
import { useMissionControlArchivedPanel } from "../board/use-mission-control-archived-panel";
import { MissionChatBack } from "./mission-chat-back";

/**
 * An ARCHIVED task's pushed chat: the archive's own wiring (the desktop
 * archive list's data, send-to-reactivate and chat props) in the pushed
 * chat's panel-only presentation.
 *
 * A send re-activates the task, and its handoff marks the sweep row running
 * before anything else hears; the screen above reads that row, so it swaps
 * this chat for the active one on the same task by itself. Nothing is left
 * for this chat to show, which is why its "show the active board" is empty.
 */
export function ArchivedMissionChat({
  agent,
  missionId,
}: {
  agent: Agent;
  missionId: string;
}) {
  const agents = useAgentStore((s) => s.agents);
  const data = useMissionControlArchived(agents);
  const { selectedId, setSelectedId } = data;
  // The nav entry names the open task; the archive's selection follows it.
  useEffect(() => {
    if (selectedId !== missionId) setSelectedId(missionId);
  }, [selectedId, setSelectedId, missionId]);
  const archivedPanel = useMissionControlArchivedPanel(data, keepScreen);
  const { chatProps, dialogs } = useArchivedChatProps(data, archivedPanel);

  // Deleting the open task removes the screen's subject: close the chat
  // instead of stranding a dead composer over it.
  const { handleDelete } = data;
  const onDelete = useCallback(
    async (item: KanbanItem) => {
      await handleDelete(item);
      if (item.id === missionId) useUIStore.getState().closeMissionChat();
    },
    [handleDelete, missionId],
  );
  const select = useCallback(
    (id: string | null) => {
      if (id === null) useUIStore.getState().closeMissionChat();
      else if (id !== missionId) openMissionChat(agent, id);
    },
    [agent, missionId],
  );

  return (
    <>
      <AIBoard
        items={data.items}
        selectedId={missionId}
        onSelect={select}
        panelOnly
        hidePanelClose
        panelLeading={<MissionChatBack />}
        {...chatProps}
        onDelete={onDelete}
      />
      {dialogs}
    </>
  );
}

function keepScreen(): void {}
