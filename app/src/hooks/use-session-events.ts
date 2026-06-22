import type { FeedItem } from "@houston-ai/chat";
import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { hasToolRuntimeError } from "../components/tool-runtime-feed";
import { listenOsEvent, subscribeHoustonEvents } from "../lib/events";
import { logger } from "../lib/logger";
import {
  resolveNotificationTarget,
  shouldNavigateOnAppActivation,
} from "../lib/notification-nav";
import { isMac } from "../lib/platform";
import { useAgentStore } from "../stores/agents";
import { useFeedStore } from "../stores/feeds";
import { useSessionStatusStore } from "../stores/session-status";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
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
  const { t } = useTranslation(["common"]);

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
          // Mark WS-delivered so a re-broadcast user_message echo (the engine
          // emits one at session-id time for cross-client sync) dedupes against
          // a turn the feed already shows instead of duplicating it (#363).
          h.pushFeedItem(
            payload.data.agent_path,
            payload.data.session_key,
            payload.data.item as FeedItem,
            { fromWs: true },
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
            const workspaceName = workspace?.name ?? "Houston";

            // Activity status flip (→ "needs_you") is owned by the
            // engine now — `sessions::start` spawns a task that writes
            // the terminal status after the runner finishes and emits
            // `ActivityChanged`. That way anything that skips this webview
            // (the web app, a scheduled run) sees the same transition. Here
            // we only need the notification title + the click-to-navigate
            // target.
            //
            // Target the agent that *finished* (matched by folder path),
            // not the currently-open one, so clicking the notification
            // jumps to it even after the user switched agents or closed
            // the chat. consumePendingNav() switches the active agent.
            const { agentName, nav } = resolveNotificationTarget(
              useAgentStore.getState().agents,
              agent_path,
              session_key,
              h.getAgent()?.name ?? "Agent",
            );
            if (
              !nav &&
              (session_key.startsWith("activity-") ||
                session_key.startsWith("routine-"))
            ) {
              logger.debug(
                `[notification] completed chat not navigable (agent not in loaded list?): agent_path=${agent_path} session_key=${session_key}`,
              );
            }

            sendSessionNotification(
              h.t("common:notifications.sessionComplete.title", {
                workspace: workspaceName,
                agent: agentName,
              }),
              h.t("common:notifications.sessionComplete.body"),
              nav,
            );
          }
          break;
        }
        case "Toast":
          h.addToast({
            title: payload.data.message,
          });
          break;
        case "AuthRequired":
          logger.info(
            `[auth] AuthRequired received: provider=${payload.data.provider}`,
          );
          h.setAuthRequired(payload.data.provider);
          break;
      }
    });

    // Notification "action performed" listener. NOTE: the plugin's Actions API
    // only fires on mobile — on every desktop OS this is a no-op. Desktop
    // notification clicks navigate via the `app-activated` / focus path below
    // (macOS: OS app-activation on click; Linux/Windows: the Rust command in
    // notification.rs raises the window and emits `app-activated`). Kept for
    // when Houston ships a mobile shell.
    let unlistenNotificationAction: (() => void) | undefined;
    import("@tauri-apps/plugin-notification").then(({ onAction }) => {
      onAction((action) => {
        logger.debug(
          `[notification] onAction fired: ${JSON.stringify(action)} pendingNav=${describePendingNotificationNav()}`,
        );
        consumePendingNav().catch((e) => {
          logger.error(
            `[notification] consumePendingNav (onAction) failed: ${e}`,
          );
        });
      })
        .then((unlisten) => {
          unlistenNotificationAction = () => {
            unlisten.unregister();
          };
        })
        .catch((e) => {
          logger.debug(`[notification] onAction registration failed: ${e}`);
        });
    });

    // `app-activated` fires on ANY foregrounding (window focus, dock click,
    // RunEvent::Resumed) — not just a notification click. So it drives two
    // different things:
    //
    //  - Navigation: only on macOS, where the JS notification plugin has no
    //    desktop click event and a click is indistinguishable from activation.
    //    On Linux/Windows a real click arrives as the distinct
    //    `notification-clicked` event below, so navigating here would yank the
    //    user back to a finished mission whenever they refocus Houston for any
    //    reason — the bug we're fixing.
    //  - Agent-list refresh: always, so external changes (e.g. Finder delete)
    //    are picked up when the window comes forward.
    const unlistenActivated = listenOsEvent<unknown>("app-activated", () => {
      logger.debug(
        `[notification] app-activated event fired: pendingNav=${describePendingNotificationNav()}`,
      );
      if (shouldNavigateOnAppActivation(isMac)) {
        consumePendingNav().catch((e) => {
          logger.error(
            `[notification] consumePendingNav (app-activated) failed: ${e}`,
          );
        });
      }
      const ws = useWorkspaceStore.getState().current;
      if (ws) {
        // Silent refresh — don't flip loading:true, which would unmount the
        // entire UI tree and wipe local state (open modals, sub-tabs, panels).
        useAgentStore.getState().loadAgents(ws.id, { silent: true });
      }
    });

    // Linux/Windows: a genuine notification click (emitted by notification.rs).
    // This is the ONLY foregrounding that should navigate to the finished
    // mission on those platforms. macOS never emits it (uses the focus path).
    const unlistenNotifClick = listenOsEvent<unknown>(
      "notification-clicked",
      () => {
        logger.debug(
          `[notification] notification-clicked event fired: pendingNav=${describePendingNotificationNav()}`,
        );
        consumePendingNav().catch((e) => {
          logger.error(
            `[notification] consumePendingNav (notification-clicked) failed: ${e}`,
          );
        });
      },
    );

    // Fallback: Tauri window focus event (macOS only — see listenForNotificationFocus).
    const unlistenTauriFocus = listenForNotificationFocus();

    return () => {
      unlisten();
      unlistenActivated();
      unlistenNotifClick();
      unlistenNotificationAction?.();
      unlistenTauriFocus
        ?.then((fn) => fn())
        .catch((e) => {
          logger.debug(
            `[notification] Tauri focus listener cleanup failed: ${e}`,
          );
        });
    };
  }, []);
}
