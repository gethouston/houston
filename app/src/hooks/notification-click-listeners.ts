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

/**
 * Every path by which a notification CLICK reaches the app, wired in one place.
 *
 * There is no single cross-platform click event, which is the whole reason this
 * is fiddly enough to deserve its own module:
 *  - **mobile only** — the plugin's Actions API (`onAction`). A no-op on every
 *    desktop OS; kept for when Houston ships a mobile shell.
 *  - **macOS** — no desktop click event exists, so app ACTIVATION is the click
 *    proxy (`app-activated`, plus a Tauri window-focus fallback).
 *  - **Linux/Windows** — a genuine, distinct `notification-clicked` event from
 *    `notification.rs`. On those platforms activation must NOT navigate, or
 *    refocusing Houston for any reason would yank the user back to a finished
 *    mission.
 * `shouldNavigateOnAppActivation` is the pure rule that keeps those apart.
 *
 * `app-activated` additionally drives an unconditional silent agent-list
 * refresh, so external changes (a Finder delete) are picked up when the window
 * comes forward. Silent on purpose: flipping `loading:true` would unmount the
 * whole tree and wipe open modals, sub-tabs and panels.
 *
 * Returns a disposer that detaches everything.
 */
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

  // macOS-only window-focus fallback (see listenForNotificationFocus).
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
