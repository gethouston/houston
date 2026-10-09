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

/**
 * Map the armed session key to the board activity id to open, fetching the
 * finished agent's activities fresh. A routine's chat is created right *after*
 * its session completes (#401), so the cache can be a beat behind at click
 * time; `fetchQuery` re-reads through the same key the board uses, so it both
 * resolves the routine chat and warms the cache for the agent we switch to.
 */
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
    // Log-only (no toast): nav is best-effort and this same path fires on a
    // bare macOS refocus, where a toast would be noise. A standard mission key
    // still encodes its id, so it can navigate even if the list fetch failed.
    logger.error(
      `[notification] failed to list activities for nav (${sessionKey}): ${e}`,
    );
    const activityId = activityIdForSessionKey([], sessionKey);
    return activityId ? { activityId, setupKind: null } : null;
  }
}

/**
 * Open the chat a clicked notification points at: resolve the agent and the
 * activity behind the armed session key, then route to the surface that chat
 * actually lives on.
 */
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
  // Captured BEFORE the navigation: the setup-chat branches below need to know
  // where the user actually was, and on macOS a bare cmd-tab refocus lands
  // here too (focus is the click proxy — there is no desktop click event).
  const prevViewMode = useUIStore.getState().viewMode;
  if (target.setupKind === "skill") {
    // A skill-setup chat has no board card: its home is the employee's own
    // Skills section, in its settings, where the chat reopens on the spot.
    // HOU-980's rule applies: a user already on that section is never yanked
    // (an open chat is visible there already, a closed one was closed
    // deliberately), and a bare macOS refocus lands here too.
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
      // Armed on arrival, like the routine chat: a deferred navigation must
      // not leave the id for another employee's section to spend.
      openAgentSettings(agent.id, "skills", {
        onOpened: () =>
          useUIStore
            .getState()
            .setPendingSkillChatActivityId(target.activityId),
      });
      return;
    }
    // Someone who cannot configure the employee has no Skills section to
    // land on: the employee's board is the one place they can reach it. The
    // setup chat has no card there, so nothing is opened over the board.
    openAgentBoard(agent.id);
    return;
  }
  useAgentStore.getState().setCurrent(agent);
  if (target.setupKind === "routine") {
    // A routine-setup chat has no board card: its home is the agent's Routines
    // section, where the chat reopens on the spot. The owner rides along with
    // the activity id so the section knows whose chat the id names.
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
    // A custom-integration setup chat has no board card; the apps CATALOG —
    // the Integrations screen, which hosts the chat — is its one home.
    // HOU-980's rule: never yank a user who is already there (a bare macOS
    // refocus lands here) — leave an open chat alone, or open it in place when
    // it was closed.
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
  // A standard mission: the agent's board, where its card lives, then the
  // mission published for that board to open.
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
