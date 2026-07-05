import type { FeedItem } from "@houston-ai/chat";
import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { listenOsEvent, subscribeHoustonEvents } from "../lib/events";
import { logger } from "../lib/logger";
import {
  resolveNotificationTarget,
  shouldNavigateOnAppActivation,
} from "../lib/notification-nav";
import { isMac } from "../lib/platform";
import { useAgentStore } from "../stores/agents";
import { useProviderSwitchStore } from "../stores/provider-switch";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import {
  consumePendingNav,
  describePendingNotificationNav,
  listenForNotificationFocus,
  sendSessionNotification,
} from "./session-notifications";

/**
 * Subscribe to "houston-event" from the engine bus.
 * Handles the provider-switch confirmation, session-complete notifications,
 * Toast, and AuthRequired. Conversation STATE (feed, spinner, status) lives in
 * the SDK conversation VM (`use-conversation-vm.ts`) — never accumulated here.
 *
 * NOTE: Data invalidation is handled by useWorkspaceInvalidation (TanStack Query).
 * This hook only handles push-based events (toasts, notifications).
 */
export function useSessionEvents() {
  const addToast = useUIStore((s) => s.addToast);
  const setAuthRequired = useUIStore((s) => s.setAuthRequired);
  const { t } = useTranslation(["common"]);

  const handlersRef = useRef({
    addToast,
    setAuthRequired,
    getWorkspace: () => useWorkspaceStore.getState().current,
    getAgent: () => useAgentStore.getState().current,
    t,
  });
  handlersRef.current = {
    addToast,
    setAuthRequired,
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
        case "FeedItem": {
          const item = payload.data.item as FeedItem;
          // Rendering is the conversation VM's job — this listener only reacts
          // to the provider-switch confirmation: the engine emitted the
          // boundary divider, so clear the staged handoff so later normal
          // turns don't re-trigger a reseed. A failed seed never emits this,
          // so the handoff stays staged and the next send retries the switch.
          if (item.feed_type === "provider_switched") {
            useProviderSwitchStore
              .getState()
              .clearPending(payload.data.agent_path, payload.data.session_key);
          }
          break;
        }
        case "SessionStatus": {
          const { status, session_key, agent_path } = payload.data;
          // Status/spinner state lives in the conversation VM; error surfacing
          // is the turn sink's job (it pushes the failure into the VM feed).
          // This listener owns only the OS notification on completion.
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
