import { listenOsEvent } from "../lib/events";
import { logger } from "../lib/logger";
import { shouldNavigateOnAppActivation } from "../lib/notification-nav";
import { isMac } from "../lib/platform";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import {
  consumePendingNav,
  describePendingNotificationNav,
  listenForNotificationFocus,
} from "./session-notifications";

export function listenForNotificationClicks(): () => void {
  const navigate = (source: string) => {
    logger.debug(
      `[notification] ${source} fired: pendingNav=${describePendingNotificationNav()}`,
    );
    consumePendingNav().catch((e) => {
      logger.error(`[notification] consumePendingNav (${source}) failed: ${e}`);
    });
  };

  let unlistenAction: (() => void) | undefined;
  import("@tauri-apps/plugin-notification").then(({ onAction }) => {
    onAction((action) => {
      logger.debug(
        `[notification] onAction payload: ${JSON.stringify(action)}`,
      );
      navigate("onAction");
    })
      .then((unlisten) => {
        unlistenAction = () => {
          unlisten.unregister();
        };
      })
      .catch((e) => {
        logger.debug(`[notification] onAction registration failed: ${e}`);
      });
  });

  const unlistenActivated = listenOsEvent<unknown>("app-activated", () => {
    if (shouldNavigateOnAppActivation(isMac)) navigate("app-activated");
    const ws = useWorkspaceStore.getState().current;
    if (ws) useAgentStore.getState().loadAgents(ws.id, { silent: true });
  });

  const unlistenClick = listenOsEvent<unknown>("notification-clicked", () => {
    navigate("notification-clicked");
  });

  const unlistenFocus = listenForNotificationFocus();

  return () => {
    unlistenActivated();
    unlistenClick();
    unlistenAction?.();
    unlistenFocus
      ?.then((fn) => fn())
      .catch((e) => {
        logger.debug(
          `[notification] Tauri focus listener cleanup failed: ${e}`,
        );
      });
  };
}
