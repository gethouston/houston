import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { subscribeHoustonEvents } from "../lib/events";
import { logger } from "../lib/logger";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { CompletionLatches } from "./completion-latches";
import { latchCompletionNotification } from "./completion-notification";
import { listenForNotificationClicks } from "./notification-click-listeners";

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
            // Activity status flip (→ "needs_you") is owned by the engine now
            // — `sessions::start` writes the terminal status after the runner
            // finishes and emits `ActivityChanged`, so anything that skips this
            // webview (the web app, a scheduled run) sees the same transition.
            // All this listener owns is the OS notification: title, body, nav
            // target and the relevance gate all live in
            // `completion-notification.ts`.
            latchCompletionNotification(
              latchesRef.current,
              agent_path,
              session_key,
              {
                agents: useAgentStore.getState().agents,
                workspaceName: h.getWorkspace()?.name ?? "Personal",
                fallbackAgentName: h.getAgent()?.name ?? "Agent",
                t: () => handlersRef.current.t,
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

    // Every way a notification click can reach us (per-OS; see the module).
    const unlistenClicks = listenForNotificationClicks();

    const latches = latchesRef.current;
    return () => {
      latches.dispose();
      unlisten();
      unlistenClicks();
    };
  }, []);
}
