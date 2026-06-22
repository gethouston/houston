import type { HoustonEvent } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { analytics, classifyAnalyticsError } from "../lib/analytics";
import { subscribeHoustonEvents } from "../lib/events";

/**
 * Subscribes to the HoustonEvent firehose and fires analytics for events
 * that originate from the backend (assistant replies, session failures,
 * backend errors) — i.e. anything that has no obvious call site in the
 * React code.
 *
 * Mount once in App.tsx. Never mounted in ui/ (library boundary rule).
 */
export function useAnalyticsSubscriber() {
  const repliesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = subscribeHoustonEvents((p: HoustonEvent) => {
      switch (p.type) {
        case "FeedItem": {
          // Activation signal: user got a finalized assistant reply.
          // "assistant_text_streaming" is skipped — it fires continuously
          // during streaming and would inflate counts. "assistant_text" is
          // emitted once per reply when the stream finalizes.
          if (p.data.item.feed_type === "assistant_text") {
            const key = `${p.data.agent_path}:${p.data.session_key}`;
            if (repliesRef.current.has(key)) break;
            repliesRef.current.add(key);
            analytics.track("chat_message_received");
          }
          break;
        }

        case "SessionStatus": {
          const { status, error } = p.data;
          if (status === "completed") {
            analytics.track("session_completed");
          }
          if (status === "error" && error) {
            const error_kind = classifyAnalyticsError(error);
            analytics.track("session_failed", { error_kind });
            analytics.track("app_error_shown", {
              source: "session",
              error_kind,
            });
          }
          break;
        }

        case "Toast": {
          if (p.data.variant === "error") {
            analytics.track("app_error_shown", {
              source: "toast",
              error_kind: classifyAnalyticsError(p.data.message ?? ""),
            });
          }
          break;
        }
      }
    });

    return () => unlisten();
  }, []);
}
