import { getCurrentWindow } from "@tauri-apps/api/window";
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id";
import { isIntegrationSetupMode } from "../lib/integration-chat-setup";
import { logger } from "../lib/logger";
import {
  activityIdForSessionKey,
  type NotificationNav,
  shouldArmNotificationNav,
  shouldNavigateOnAppActivation,
} from "../lib/notification-nav";
import { osShowSessionNotification } from "../lib/os-bridge";
import { isMac } from "../lib/platform";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import { isRoutineSetupMode } from "../lib/routine-chat-setup";
import { isSkillSetupMode } from "../lib/skill-chat-setup";
import { tauriActivity } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";

let pendingNotificationNav: NotificationNav | null = null;
let pendingNavTimer: ReturnType<typeof setTimeout> | null = null;

export function describePendingNotificationNav() {
  return JSON.stringify(pendingNotificationNav);
}

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

export async function consumePendingNav() {
  if (!pendingNotificationNav) return;
  const { agentId, sessionKey } = pendingNotificationNav;
  pendingNotificationNav = null;
  if (pendingNavTimer) {
    clearTimeout(pendingNavTimer);
    pendingNavTimer = null;
  }

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
  useAgentStore.getState().setCurrent(agent);
  if (target.setupKind === "routine") {
    // A routine-setup chat has no board card: its home is the Routines tab,
    // where the panel reopens on the spot.
    useUIStore.getState().setViewMode("routines");
    useUIStore.getState().setPendingRoutineActivityId(target.activityId);
    return;
  }
  if (target.setupKind === "integration") {
    // A custom-integration setup chat has no board card either: its home is
    // the global Integrations page, where the panel reopens for this agent.
    useUIStore.getState().setViewMode(INTEGRATIONS_VIEW_ID);
    useUIStore.getState().setIntegrationSetupChatAgentId(agent.id);
    return;
  }
  if (target.setupKind === "skill") {
    // A skill-setup chat has no board card either: its home is the agent's
    // Skills section (Agent Settings), where the chat reopens on the spot.
    useUIStore.getState().setViewMode("job-description");
    useUIStore.getState().setJobDescriptionTarget("skills");
    useUIStore.getState().setPendingSkillChatActivityId(target.activityId);
    return;
  }
  useUIStore.getState().setViewMode("activity");
  useUIStore.getState().setActivityPanelId(target.activityId, {
    forceOpen: true,
  });
}

export async function sendSessionNotification(
  title: string,
  body: string,
  nav?: NotificationNav,
) {
  try {
    if (isMac) {
      // macOS: the JS notification plugin's click activates the app, which
      // fires the focus event the listener below consumes. Unchanged.
      const {
        isPermissionGranted,
        requestPermission,
        sendNotification: notify,
      } = await import("@tauri-apps/plugin-notification");

      let granted = await isPermissionGranted();
      if (!granted) {
        const perm = await requestPermission();
        granted = perm === "granted";
      }
      if (!granted) return;

      notify({ title, body, sound: "Glass" });
    } else {
      // Linux/Windows: the plugin is fire-and-forget (no click event) and a
      // notification click doesn't focus the window, so the focus path never
      // fires. The Rust command shows a native notification whose click raises
      // the window and emits `notification-clicked`.
      await osShowSessionNotification(title, body);
    }

    if (!nav) return;

    // Linux/Windows emit a real `notification-clicked` event, so arm even while
    // focused: the user can click the toast from another Houston chat and that
    // explicit click should navigate. macOS has no desktop click event in the
    // JS plugin, so focus is its click proxy and we only arm while backgrounded.
    const focused = await getCurrentWindow().isFocused();
    if (!shouldArmNotificationNav(focused, !isMac)) return;

    pendingNotificationNav = nav;
    if (pendingNavTimer) clearTimeout(pendingNavTimer);
    pendingNavTimer = setTimeout(
      () => {
        pendingNotificationNav = null;
      },
      5 * 60 * 1000,
    );
    logger.debug(
      `[notification] pending nav set: agentId=${nav.agentId} sessionKey=${nav.sessionKey}`,
    );
  } catch (e) {
    logger.error(`[notification] Failed: ${e}`);
  }
}

export function listenForNotificationFocus(): Promise<() => void> | undefined {
  // macOS only. There a notification click surfaces as window focus (the JS
  // plugin gives no desktop click event), so focus is the navigate signal. On
  // Linux/Windows the Rust click handler emits the distinct
  // `notification-clicked` event instead, and consuming on focus here would
  // yank the user back to a finished mission on any refocus.
  if (!shouldNavigateOnAppActivation(isMac)) return undefined;
  try {
    return getCurrentWindow().onFocusChanged(({ payload: focused }) => {
      if (!focused || !pendingNotificationNav) return;
      logger.debug(
        `[notification] onFocusChanged fired: focused=${focused} pendingNav=${JSON.stringify(pendingNotificationNav)}`,
      );
      consumePendingNav().catch((e) => {
        logger.error(`[notification] consumePendingNav (focus) failed: ${e}`);
      });
    });
  } catch (e) {
    logger.debug(`[notification] Tauri focus listener unavailable: ${e}`);
    return undefined;
  }
}
