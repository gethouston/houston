import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { HoustonEvent } from "@houston-ai/core";
import type { FeedItem } from "@houston-ai/chat";
import { useFeedStore } from "../stores/feeds";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useAgentStore } from "../stores/agents";
import { useSessionStatusStore } from "../stores/session-status";
import { subscribeHoustonEvents, listenOsEvent } from "../lib/events";
import { logger } from "../lib/logger";
import { tauriClaude } from "../lib/tauri";
import { hasToolRuntimeError } from "../components/tool-runtime-feed";
import {
  consumePendingNav,
  describePendingNotificationNav,
  listenForNotificationFocus,
  sendSessionNotification,
} from "./session-notifications";

/**
 * Subscribe to "houston-event" from the Rust backend.
 * Handles FeedItem, SessionStatus, Toast, AuthRequired, and native notifications.
 *
 * NOTE: Data invalidation is handled by useWorkspaceInvalidation (TanStack Query).
 * This hook only handles push-based events (streaming, toasts, notifications).
 */
export function useSessionEvents() {
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const addToast = useUIStore((s) => s.addToast);
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);
  const { t } = useTranslation(["providers", "common"]);

  const handlersRef = useRef({
    pushFeedItem,
    addToast,
    setAuthRequired,
    setSessionStatus: useSessionStatusStore.getState().setStatus,
    getWorkspace: () => useWorkspaceStore.getState().current,
    getAgent: () => useAgentStore.getState().current,
    t,
  });
  handlersRef.current = {
    pushFeedItem,
    addToast,
    setAuthRequired,
    setSessionStatus: useSessionStatusStore.getState().setStatus,
    getWorkspace: () => useWorkspaceStore.getState().current,
    getAgent: () => useAgentStore.getState().current,
    t,
  };

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const unlisten = subscribeHoustonEvents((payload: HoustonEvent) => {
      const h = handlersRef.current;

      switch (payload.type) {
        case "FeedItem":
          h.pushFeedItem(
            payload.data.agent_path,
            payload.data.session_key,
            payload.data.item as FeedItem,
          );
          break;
        case "SessionStatus": {
          const { status, error, session_key, agent_path } = payload.data;
          if (
            status === "starting" ||
            status === "running" ||
            status === "completed" ||
            status === "error"
          ) {
            h.setSessionStatus(agent_path, session_key, status);
          }
          if (status === "error" && error) {
            // When auth is required, the backend has emitted AuthRequired and
            // the inline reconnect card renders from the authRequired store
            // state. Suppress the generic "Session error: ..." system message
            // so the feed doesn't show a raw error *and* the card.
            const isAuth = useUIStore.getState().authRequired !== null;
            const feedItems =
              useFeedStore.getState().items[agent_path]?.[session_key] ?? [];
            const hasRuntimeCard = hasToolRuntimeError(feedItems);
            if (!isAuth && !hasRuntimeCard) {
              h.pushFeedItem(agent_path, session_key, {
                feed_type: "system_message",
                data: `Session error: ${error}`,
              } as FeedItem);
            } else {
              logger.info(
                `[session] suppressing Session error system_message for ${agent_path}/${session_key}`,
              );
            }
          }
          if (status === "completed") {
            const workspace = h.getWorkspace();
            const agent = h.getAgent();
            const workspaceName = workspace?.name ?? "Houston";
            const agentName = agent?.name ?? "Agent";
            let nav: { agentId: string; activityId: string } | undefined;

            // Activity status flip (→ "needs_you") is owned by the
            // engine now — `sessions::start` spawns a task that writes
            // the terminal status after the runner finishes and emits
            // `ActivityChanged`. That way phone-only users (and
            // anything else that skips this webview) see the same
            // transition. We still need the activityId for the
            // notification nav target.
            if (session_key.startsWith("activity-") && !session_key.startsWith("routine-")) {
              const activityId = session_key.replace("activity-", "");
              // Only navigate if the completed session belongs to the currently-open agent.
              if (agent?.id && agent.folderPath === agent_path) {
                nav = { agentId: agent.id, activityId };
              } else {
                logger.debug(`[notification] session completed for a non-active agent: agent_path=${agent_path}`);
              }
            }

            sendSessionNotification(`${workspaceName} — ${agentName}`, "Your agent has finished working.", nav);
          }
          break;
        }
        case "Toast":
          h.addToast({
            title: payload.data.message,
          });
          break;
        case "AuthRequired":
          logger.info(`[auth] AuthRequired received: provider=${payload.data.provider}`);
          h.setAuthRequired(payload.data.provider);
          break;
        case "ClaudeCliFailed":
          // Per the beta-stage "no silent failures" rule, every install
          // failure must reach the user somewhere — the onboarding card
          // shows it inline but a user already past onboarding (e.g. on
          // a Houston upgrade that re-downloads claude-code) would
          // otherwise never know. Toast carries the engine's classified
          // message verbatim because it's already user-readable (see
          // `houston_claude_installer::classify_reqwest_error`).
          logger.warn(`[claude-install] ClaudeCliFailed: ${payload.data.message}`);
          h.addToast({
            variant: "error",
            title: h.t("providers:claudeInstall.failedTitle"),
            description: payload.data.message,
            action: {
              label: h.t("providers:claudeInstall.retry"),
              onClick: () => {
                tauriClaude.install().catch((err: unknown) => {
                  logger.warn(`[claude-install] retry from toast failed: ${String(err)}`);
                });
              },
            },
          });
          break;
      }
    });

    // Case: user clicks notification → plugin fires onAction directly.
    // This is the most reliable path for macOS desktop notification clicks.
    let unlistenNotificationAction: (() => void) | undefined;
    import("@tauri-apps/plugin-notification").then(({ onAction }) => {
      onAction((action) => {
        logger.debug(`[notification] onAction fired: ${JSON.stringify(action)} pendingNav=${describePendingNotificationNav()}`);
        consumePendingNav();
      }).then((unlisten) => {
        unlistenNotificationAction = () => { unlisten.unregister(); };
      }).catch((e) => {
        logger.debug(`[notification] onAction registration failed: ${e}`);
      });
    });

    // Case: app in background — user clicks notification → OS activates app →
    // Rust emits "app-activated" via RunEvent::Resumed → we consume pending nav.
    // Also refresh the agent list so any external changes (e.g. Finder delete) are picked up.
    const unlistenActivated = listenOsEvent<unknown>("app-activated", () => {
      logger.debug(`[notification] app-activated event fired: pendingNav=${describePendingNotificationNav()}`);
      consumePendingNav();
      const ws = useWorkspaceStore.getState().current;
      if (ws) {
        // Silent refresh — don't flip loading:true, which would unmount the
        // entire UI tree and wipe local state (open modals, sub-tabs, panels).
        useAgentStore.getState().loadAgents(ws.id, { silent: true });
      }
    });

    // Fallback: Tauri window focus event (fires when user switches to the app any way).
    const unlistenTauriFocus = listenForNotificationFocus();

    return () => {
      unlisten();
      unlistenActivated();
      unlistenNotificationAction?.();
      unlistenTauriFocus?.then((fn) => fn()).catch((e) => {
        logger.debug(`[notification] Tauri focus listener cleanup failed: ${e}`);
      });
    };
  }, []);
}
