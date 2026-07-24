import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  completionInteractionReady,
  interactionNotificationBodyKey,
  interactionQuestionCount,
} from "../lib/active-interaction";
import { listenOsEvent, subscribeHoustonEvents } from "../lib/events";
import { logger } from "../lib/logger";
import {
  resolveNotificationTarget,
  shouldNavigateOnAppActivation,
} from "../lib/notification-nav";
import { isMac } from "../lib/platform";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { CompletionLatches } from "./completion-latches";
import {
  consumePendingNav,
  describePendingNotificationNav,
  listenForNotificationFocus,
  sendSessionNotification,
} from "./session-notifications";
import {
  getConversationBoardStatus,
  getConversationInteraction,
} from "./use-conversation-vm";

/**
 * How long a completed session waits for its settle `ActivityChanged` echo
 * before its notification fires with the plain body. The echo normally lands
 * within a tick; this is only the no-board-card backstop.
 */
const COMPLETION_INTERACTION_GRACE_MS = 2000;

/**
 * Subscribe to "houston-event" from the engine bus.
 * Handles session-complete notifications, Toast, and AuthRequired.
 * Conversation STATE (feed, spinner, status) lives in
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

  // Completion notifications latched at `SessionStatus completed` and fired on
  // the settle's `ActivityChanged` echo — the ordering where the interaction the
  // turn ended on (folded into the conversation VM by `persistBoardStatus`) is
  // readable, so the body reads question / connect / plain finish. A latch fires
  // only once ITS session's settle has folded (`completionInteractionReady`), so
  // a sibling session's echo or an unrelated `.houston` write — `ActivityChanged`
  // carries no session key — can't fire it early with the plain body. The grace
  // timer is the backstop for a completed session with no folded board card.
  const latchesRef = useRef(
    new CompletionLatches(COMPLETION_INTERACTION_GRACE_MS),
  );

  useEffect(() => {
    // Permission is NOT requested here anymore: a context-less prompt on load
    // is exactly what this feature replaces. The ask now happens with context
    // through the first-mission pre-prompt, the settings row, and the
    // missed-ping catch-net (see `notification-nudge.ts`).
    const unlisten = subscribeHoustonEvents((payload: HoustonEvent) => {
      const h = handlersRef.current;

      switch (payload.type) {
        case "SessionStatus": {
          const { status, session_key, agent_path } = payload.data;
          // Status/spinner state lives in the conversation VM; error surfacing
          // is the turn sink's job (it pushes the failure into the VM feed).
          // This listener owns only the OS notification on completion.
          if (status === "completed") {
            const workspace = h.getWorkspace();
            const workspaceName = workspace?.name ?? "Personal";

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

            const title = h.t("common:notifications.sessionComplete.title", {
              workspace: workspaceName,
              agent: agentName,
            });
            // Latch: the body depends on the interaction the turn settled on,
            // which `persistBoardStatus` folds into the VM AFTER this event but
            // BEFORE the settle's `ActivityChanged` echo. `ready` gates the echo
            // fire on that fold having landed; the send reads the settled body.
            latchesRef.current.latch(
              agent_path,
              session_key,
              () =>
                completionInteractionReady(
                  getConversationBoardStatus(agent_path, session_key),
                ),
              () => {
                const interaction =
                  getConversationInteraction(agent_path, session_key) ?? null;
                const bodyKey = interactionNotificationBodyKey(interaction);
                const body =
                  bodyKey === "sessionComplete.question"
                    ? handlersRef.current.t(
                        "common:notifications.sessionComplete.question",
                        { count: interactionQuestionCount(interaction) },
                      )
                    : bodyKey === "sessionComplete.signin"
                      ? handlersRef.current.t(
                          "common:notifications.sessionComplete.signin",
                        )
                      : bodyKey === "sessionComplete.connect"
                        ? handlersRef.current.t(
                            "common:notifications.sessionComplete.connect",
                          )
                        : bodyKey === "sessionComplete.credential"
                          ? handlersRef.current.t(
                              "common:notifications.sessionComplete.credential",
                            )
                          : handlersRef.current.t(
                              "common:notifications.sessionComplete.body",
                            );
                sendSessionNotification(title, body, nav);
              },
            );
          }
          break;
        }
        case "ActivityChanged": {
          // The settle's write-through echo: fire any completion latched for
          // this agent whose own settle has folded (a premature echo — sibling
          // session or unrelated write — leaves the rest for their own echo).
          latchesRef.current.fireForAgent(payload.data.agent_path);
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

    const latches = latchesRef.current;
    return () => {
      latches.dispose();
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
