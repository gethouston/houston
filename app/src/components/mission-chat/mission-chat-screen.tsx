import { AIBoard } from "@houston-ai/board";
import { useEffect, useMemo, useRef } from "react";
import { useAllConversations } from "../../hooks/queries";
import { useVisualViewportInset } from "../../hooks/use-visual-viewport-inset";
import { pendingMissionSurface } from "../../lib/board-surface-nav";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useBoardChatWiring } from "../board/use-board-chat-wiring";
import { tourAnchor } from "../shell/workspace-tour-steps.ts";
import { ArchivedMissionChat } from "./archived-mission-chat";
import { MissionChatBack } from "./mission-chat-back";
import { useMissionChatSource } from "./use-mission-chat-source";

export function MissionChatScreen() {
  const chatAgentId = useUIStore((s) => s.chatAgentId);
  const closeMissionChat = useUIStore((s) => s.closeMissionChat);
  const agent = useAgentStore((s) =>
    chatAgentId === null
      ? null
      : (s.agents.find((a) => a.id === chatAgentId) ?? null),
  );

  useEffect(() => {
    if (chatAgentId !== null && agent === null) closeMissionChat();
  }, [chatAgentId, agent, closeMissionChat]);

  if (agent === null) return null;
  return <MissionChatFrame agent={agent} />;
}

function MissionChatFrame({ agent }: { agent: Agent }) {
  const missionId = useUIStore((s) => s.chatMissionId);
  const agents = useAgentStore((s) => s.agents);
  const rosterPaths = useMemo(() => agents.map((a) => a.folderPath), [agents]);
  const { data: rows } = useAllConversations(rosterPaths);
  const screenRef = useRef<HTMLDivElement>(null);
  const keyboardInset = useVisualViewportInset(screenRef);
  const archived =
    missionId !== null && pendingMissionSurface(rows, missionId) === "archived";

  return (
    <div
      ref={screenRef}
      {...tourAnchor("taskChat")}
      data-testid="mission-chat-screen"
      className="flex h-full min-h-0 flex-col pb-safe"
      style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
    >
      {archived ? (
        <ArchivedMissionChat agent={agent} missionId={missionId} />
      ) : (
        <ActiveMissionChat agent={agent} missionId={missionId} />
      )}
    </div>
  );
}

function ActiveMissionChat({
  agent,
  missionId,
}: {
  agent: Agent;
  missionId: string | null;
}) {
  const agents = useAgentStore((s) => s.agents);
  const source = useMissionChatSource(agents, agent, missionId);
  const wiring = useBoardChatWiring(source);

  return (
    <>
      <AIBoard
        items={source.items}
        selectedId={source.selectedId}
        onSelect={source.setSelectedId}
        onDelete={source.onDelete}
        onApprove={source.onApprove}
        onArchive={source.onArchive}
        onRename={source.onRename}
        panelOnly
        hidePanelClose
        panelLeading={<MissionChatBack />}
        {...wiring.chatProps}
      />
      {wiring.dialogs}
    </>
  );
}
