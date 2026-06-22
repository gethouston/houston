// Listen to the engine's WS envelope and invalidate matching TanStack
// Query keys. Mirrors the desktop's `use-agent-invalidation.ts` but
// tuned for the mobile reality: the WS travels through three hops
// (mobile → CF → DurableObject → desktop tunnel WS → desktop engine WS),
// any of which can drop silently. Plus iOS Safari aggressively
// suspends backgrounded tabs.
//
// Reactivity contract: WS events drive the LIVE UI updates, but we
// must never assume we received every event. Three safety nets keep
// the cache honest even when the WS lies:
//
//   1. WS reconnect → refetch all cached queries. Anything emitted
//      while the socket was down was never delivered.
//   2. Tab becomes visible → refetch all cached queries. iOS may have
//      paused the JS runtime AND silently dropped frames during the
//      suspension window.
//   3. Per-event invalidation (the original behavior) → fast path for
//      the common case where the WS works.

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getWs, useEngineReady } from "../lib/engine";

type Env = { type: string; data?: Record<string, unknown> };

export function useEngineInvalidation(): void {
  const qc = useQueryClient();
  // React-observable readiness so this effect re-runs the moment
  // pairing completes. Without this, the QR-scan boot path mounts
  // `InvalidationPump` before the engine is ready, the effect bails,
  // and the WS subscription is never sent — events flow but mobile
  // ignores them until the user refreshes the page.
  const ready = useEngineReady();

  useEffect(() => {
    if (!ready) return;
    const ws = getWs();

    // Subscribe to the engine's firehose so we hear about conversation
    // status changes, new activities, etc. even when no chat view is
    // mounted. Per-session subscriptions in useChatHistory are kept so
    // the desktop can narrow if ever needed — but for a phone with only
    // one user on one workspace, the firehose is the simplest model.
    ws.subscribe(["*"]);

    const unsubEvent = ws.onEvent((ev: unknown) => {
      const envelope = ev as Env;
      const kind = envelope.type;
      const data = envelope.data ?? {};

      switch (kind) {
        case "ActivityChanged":
        case "ConversationsChanged":
          qc.invalidateQueries({ queryKey: ["conversations"] });
          break;
        case "FeedItem":
        case "SessionStatus":
          qc.invalidateQueries({
            queryKey: ["chat", data.session_key ?? data.sessionKey],
          });
          qc.invalidateQueries({ queryKey: ["conversations"] });
          break;
        case "RoutinesChanged":
          qc.invalidateQueries({ queryKey: ["routines"] });
          break;
        default:
          // Silent for unknown types.
          break;
      }
    });

    // Safety net 1: WS reconnect. Anything that fired while the socket
    // was down was never delivered, so refetch every active query.
    // Inactive (unmounted) queries are left alone — `invalidateQueries`
    // with `refetchType: "active"` is the default but we spell it out
    // for future-readers.
    const unsubReconnect = ws.onReconnect(() => {
      qc.invalidateQueries({ refetchType: "active" });
    });

    // Safety net 2: tab becomes visible. iOS Safari suspends background
    // tabs aggressively; on resume the WS may still be "open" but
    // events that arrived during suspension were dropped at the
    // browser layer. Refetch everything visible. (Hidden queries
    // re-fetch on next mount via TanStack defaults.)
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries({ refetchType: "active" });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      unsubEvent();
      unsubReconnect();
      try {
        ws.unsubscribe(["*"]);
      } catch {
        /* ignore — ws may already be disconnected */
      }
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc, ready]);
}
