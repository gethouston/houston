"use client";

import { useEffect, useRef } from "react";
import type { HoustonEvent } from "../houston-event";

export type TauriListenFn = <T>(
  event: string,
  handler: (event: { payload: T }) => void,
) => Promise<() => void>;

export interface SessionEventsHandlers {
  listen: TauriListenFn;
  onFeedItem: (
    agentPath: string,
    sessionKey: string,
    item: { feed_type: string; data: unknown },
  ) => void;
  getActiveSession?: () => { agentPath: string; sessionKey: string } | null;
  onEvent?: (event: HoustonEvent) => void;
}

export function useSessionEvents(handlers: SessionEventsHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const unlisten = ref.current.listen<HoustonEvent>(
      "houston-event",
      (event) => {
        const h = ref.current;
        const payload = event.payload;

        switch (payload.type) {
          case "FeedItem": {
            const { agent_path, session_key } = payload.data;
            const active = h.getActiveSession?.() ?? null;
            const isDesktopDupe =
              active?.agentPath === agent_path &&
              active?.sessionKey === session_key &&
              (payload.data.item as { feed_type: string }).feed_type ===
                "user_message";
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
              h.onFeedItem(payload.data.agent_path, payload.data.session_key, {
                feed_type: "system_message",
                data: `Session error: ${payload.data.error}`,
              });
            }
            h.onEvent?.(payload);
            break;
          case "Toast":
            console.log(
              `[toast:${payload.data.variant}]`,
              payload.data.message,
            );
            h.onEvent?.(payload);
            break;
          default:
            h.onEvent?.(payload);
            break;
        }
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
