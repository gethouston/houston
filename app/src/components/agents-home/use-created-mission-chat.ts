import { useEffect } from "react";
import { readCreatedMission } from "../../lib/created-mission-handoff";
import { openMissionChat } from "../../lib/mission-chat";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { useIsActiveView } from "../shell/keep-alive-views";
import { isCreatedMissionOf } from "./agent-missions-model";

/**
 * A mission created from the agent's own phone screen (its first day) opens
 * the way a row tap does: its chat is pushed. The create publishes its target
 * for a board to open, and no board is on the glass here, so without this the
 * tap would open nothing and leave the target for a later board to pop open.
 */
export function useCreatedMissionChat(agent: Agent): void {
  const isActiveScreen = useIsActiveView();
  const pendingId = useUIStore((s) => s.activityPanelId);
  useEffect(() => {
    if (!isActiveScreen) return;
    if (!isCreatedMissionOf(readCreatedMission(), pendingId, agent.folderPath))
      return;
    useUIStore.getState().setActivityPanelId(null);
    openMissionChat(agent, pendingId);
  }, [isActiveScreen, pendingId, agent]);
}
