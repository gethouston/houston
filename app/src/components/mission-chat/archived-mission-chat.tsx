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
  useEffect(() => {
    if (selectedId !== missionId) setSelectedId(missionId);
  }, [selectedId, setSelectedId, missionId]);
  const archivedPanel = useMissionControlArchivedPanel(data, keepScreen);
  const { chatProps, dialogs } = useArchivedChatProps(data, archivedPanel);

  const { handleDelete } = data;
  const onDelete = useCallback(
    (item: KanbanItem) => {
      handleDelete(item);
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
