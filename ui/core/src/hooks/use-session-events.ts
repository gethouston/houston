/**
 * Base hook for subscribing to houston-tauri backend events.
 *
 * Uses a ref-based handler pattern to avoid the race condition in
 * useHoustonEvent (where handler recreation tears down and re-registers
 * the listener, causing missed events).
 *
 * Apps pass their own `listen` function from `@tauri-apps/api/event`
 * so @houston-ai/core doesn't need a build-time dependency on Tauri.
 *
 * Handles the core events (FeedItem, SessionStatus, Toast) and calls
 * an optional `onEvent` callback for app-specific event handling.
 */

import { useEffect, useRef } from "react";
import type { HoustonEvent } from "../types";

/** Tauri listen function signature. */
export type TauriListenFn = <T>(
  event: string,
  handler: (event: { payload: T }) => void,
) => Promise<() => void>;

export interface SessionEventsHandlers {
  /** The Tauri `listen` function — import from `@tauri-apps/api/event`. */
  listen: TauriListenFn;
  /** Called for every FeedItem event. Receives (agentPath, sessionKey, item). */
  onFeedItem: (
    agentPath: string,
    sessionKey: string,
    item: { feed_type: string; data: unknown },
  ) => void;
  /** Returns the active (agentPath, sessionKey) pair for desktop-dupe filtering. */
  getActiveSession?: () => { agentPath: string; sessionKey: string } | null;
  /** Called for app-specific events not handled by the base hook. */
  onEvent?: (event: HoustonEvent) => void;
}

/**
 * Subscribe to "houston-event" from the Rust backend.
 *
 * Core events handled:
 * - FeedItem → calls `onFeedItem(agent_path, session_key, item)`, with desktop-dupe filtering
 * - SessionStatus → pushes system_message on error
 * - Toast → console.log
 *
 * All other events forwarded to `onEvent` if provided.
 */
export function useSessionEvents(handlers: SessionEventsHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const unlisten = ref.current.listen<HoustonEvent>("houston-event", (event) => {
      const h = ref.current;
      const payload = event.payload;

      switch (payload.type) {
        case "FeedItem": {
          const { agent_path, session_key } = payload.data;
          const active = h.getActiveSession?.() ?? null;
          const isDesktopDupe =
            active?.agentPath === agent_path &&
            active?.sessionKey === session_key &&
            (payload.data.item as { feed_type: string }).feed_type === "user_message";
          if (!isDesktopDupe) {
            h.onFeedItem(
              agent_path,
              session_key,
              payload.data.item as { feed_type: string; data: unknown },
            );
          }
          break;
        }
        case "SessionStatus":
          if (payload.data.status === "error" && payload.data.error) {
            // Echo the session-status error as a feed item so an un-carded
            // failure is never silent. When a typed error card already covered
            // the turn, this redundant raw line is suppressed downstream in
            // `feed-to-messages` (`isSessionErrorEcho`) — keep the
            // "Session error:" prefix in sync with that matcher.
            h.onFeedItem(payload.data.agent_path, payload.data.session_key, {
              feed_type: "system_message",
              data: `Session error: ${payload.data.error}`,
            });
          }
          h.onEvent?.(payload);
          break;
        case "Toast":
          console.log(`[toast:${payload.data.variant}]`, payload.data.message);
          h.onEvent?.(payload);
          break;
        default:
          h.onEvent?.(payload);
          break;
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // stable — no deps, uses refs
}
