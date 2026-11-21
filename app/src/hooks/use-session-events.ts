import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { subscribeHoustonEvents } from "../lib/events";
import {
  isSessionStatusValue,
  retireParkedInteractionOnFeedItem,
  retireParkedInteractionOnSessionStatus,
} from "../lib/interaction-draft-retire";
import { logger } from "../lib/logger";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { CompletionLatches } from "./completion-latches";
import { latchCompletionNotification } from "./completion-notification";
import { listenForNotificationClicks } from "./notification-click-listeners";

const COMPLETION_INTERACTION_GRACE_MS = 2000;

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

  const latchesRef = useRef(
    new CompletionLatches(COMPLETION_INTERACTION_GRACE_MS),
  );

  useEffect(() => {
    const unlisten = subscribeHoustonEvents((payload: HoustonEvent) => {
      const h = handlersRef.current;

      switch (payload.type) {
        case "SessionStatus": {
          const { status, session_key, agent_path } = payload.data;
          if (isSessionStatusValue(status))
            retireParkedInteractionOnSessionStatus(status, session_key);
          if (status === "completed") {
            latchCompletionNotification(
              latchesRef.current,
              agent_path,
              session_key,
              {
                agents: useAgentStore.getState().agents,
                workspaceName: h.getWorkspace()?.name ?? "Personal",
                fallbackAgentName: h.getAgent()?.name ?? "Agent",
                t: () => handlersRef.current.t,
                stopReason: payload.data.stop_reason,
              },
            );
          }
          break;
        }
        case "FeedItem": {
          retireParkedInteractionOnFeedItem(
            payload.data.session_key,
            payload.data.item,
          );
          break;
        }
        case "ActivityChanged": {
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

    const unlistenClicks = listenForNotificationClicks();

    const latches = latchesRef.current;
    return () => {
      latches.dispose();
      unlisten();
      unlistenClicks();
    };
  }, []);
}
