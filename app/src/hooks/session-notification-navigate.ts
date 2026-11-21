import type { Capabilities } from "@houston/engine-adapter";
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id";
import { useAgentSettingsNav } from "../components/team-view/agent-settings-nav-store";
import { canOpenAgentSettings } from "../lib/agent-nav";
import { isIntegrationSetupMode } from "../lib/integration-chat-setup";
import { logger } from "../lib/logger";
import { openMissionChat } from "../lib/mission-chat";
import {
  activityIdForSessionKey,
  type NotificationNav,
} from "../lib/notification-nav";
import {
  openAgentBoard,
  openAgentSection,
  openAgentSettings,
} from "../lib/open-agent";
import { osIsNativeMobile } from "../lib/os-bridge/platform";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { isRoutineSetupMode } from "../lib/routine-chat-setup";
import { isSkillSetupMode } from "../lib/skill-chat-setup";
import { tauriActivity } from "../lib/tauri";
import { AGENT_VIEW_ID } from "../lib/top-level-views";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";

async function resolveActivityTarget(
  agentPath: string,
  sessionKey: string,
): Promise<{
  activityId: string;
  setupKind: "routine" | "integration" | "skill" | null;
} | null> {
  try {
    const activities = await queryClient.fetchQuery({
      queryKey: queryKeys.activity(agentPath),
      queryFn: () => tauriActivity.list(agentPath),
      staleTime: 0,
    });
    const activityId = activityIdForSessionKey(activities, sessionKey);
    if (!activityId) return null;
    const activity = activities.find((a) => a.id === activityId);
    const setupKind = isRoutineSetupMode(activity?.agent)
      ? "routine"
      : isIntegrationSetupMode(activity?.agent)
        ? "integration"
        : isSkillSetupMode(activity?.agent)
          ? "skill"
          : null;
    return { activityId, setupKind };
  } catch (e) {
    logger.error(
      `[notification] failed to list activities for nav (${sessionKey}): ${e}`,
    );
    const activityId = activityIdForSessionKey([], sessionKey);
    return activityId ? { activityId, setupKind: null } : null;
  }
}

export async function navigateToNotificationTarget({
  agentId,
  sessionKey,
}: NotificationNav) {
  const agents = useAgentStore.getState().agents;
  logger.debug(
    `[notification] consuming nav: agentId=${agentId} sessionKey=${sessionKey} agents=[${agents.map((a) => a.id).join(",")}]`,
  );
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    logger.debug("[notification] agent not found, cannot navigate");
    return;
  }

  const target = await resolveActivityTarget(agent.folderPath, sessionKey);
  if (!target) {
    logger.debug(
      `[notification] no activity matches sessionKey=${sessionKey}, cannot navigate`,
    );
    return;
  }

  logger.debug(
    `[notification] navigating to agent=${agent.name} activity=${target.activityId} (sessionKey=${sessionKey})`,
  );
  const prevViewMode = useUIStore.getState().viewMode;
  if (target.setupKind === "skill") {
    const ui = useUIStore.getState();
    const shown = useAgentSettingsNav.getState().shown;
    if (
      prevViewMode === AGENT_VIEW_ID &&
      ui.activeAgentId === agent.id &&
      ui.agentSection === "settings" &&
      shown?.agentId === agent.id &&
      shown.section === "skills"
    ) {
      logger.debug(
        "[notification] already on the employee's Skills, staying put",
      );
      return;
    }
    const capabilities = queryClient.getQueryData<Capabilities>(
      queryKeys.capabilities(),
    );
    useAgentStore.getState().setCurrent(agent);
    if (canOpenAgentSettings(capabilities, agent)) {
      openAgentSettings(agent.id, "skills", {
        onOpened: () =>
          useUIStore
            .getState()
            .setPendingSkillChatActivityId(target.activityId),
      });
      return;
    }
    openAgentBoard(agent.id);
    return;
  }
  useAgentStore.getState().setCurrent(agent);
  if (target.setupKind === "routine") {
    openAgentSection(agent.id, "routines", {
      onOpened: () =>
        useUIStore.getState().setPendingRoutineChat({
          agentId: agent.id,
          activityId: target.activityId,
        }),
    });
    return;
  }
  if (target.setupKind === "integration") {
    const ui = useUIStore.getState();
    if (prevViewMode === INTEGRATIONS_VIEW_ID) {
      if (ui.integrationSetupChatAgentId !== agent.id) {
        ui.onPanelClose?.();
        ui.setIntegrationSetupChatAgentId(agent.id);
      }
      return;
    }
    ui.onPanelClose?.();
    ui.setViewMode(INTEGRATIONS_VIEW_ID);
    ui.setIntegrationSetupChatAgentId(agent.id);
    return;
  }
  if (osIsNativeMobile()) {
    openMissionChat(agent, target.activityId);
    return;
  }
  openAgentBoard(agent.id, {
    onOpened: () =>
      useUIStore.getState().setActivityPanelId(target.activityId, {
        forceOpen: true,
      }),
  });
}
