import { useIsMobile } from "@houston-ai/core";
import { useEffect } from "react";
import { readCreatedMission } from "../../lib/created-mission-handoff";
import { openMissionChat } from "../../lib/mission-chat";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useIsActiveView } from "../shell/keep-alive-views";
import { drillInMissionTarget } from "./agent-missions-target";
import type { AgentHomeConversation } from "./agents-home-model";

/**
 * The phone's consumer of a published task target: the employee's task list
 * opens it as the pushed chat above itself ({@link drillInMissionTarget}).
 * The desktop boards consume the same target themselves, so this listens only
 * below the breakpoint and only while its screen is on the glass.
 */
export function useDrillInMissionTarget(
  agent: Agent,
  rows: readonly AgentHomeConversation[] | undefined,
): void {
  const isMobile = useIsMobile();
  const isActive = useIsActiveView();
  const pendingId = useUIStore((s) => s.activityPanelId);
  const chatAgentId = useUIStore((s) => s.chatAgentId);
  const chatMissionId = useUIStore((s) => s.chatMissionId);

  useEffect(() => {
    if (!isMobile || !isActive || pendingId === null) return;
    const step = drillInMissionTarget({
      pendingId,
      rows,
      agentPath: agent.folderPath,
      created: readCreatedMission(),
      chatMissionId,
      chatOpen: chatAgentId !== null,
    });
    if (step === "wait") return;
    useUIStore.getState().setActivityPanelId(null);
    if (step === "open") openMissionChat(agent, pendingId);
  }, [isMobile, isActive, pendingId, rows, agent, chatAgentId, chatMissionId]);
}
