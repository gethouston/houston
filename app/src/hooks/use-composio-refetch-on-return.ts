import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tauriConnections } from "../lib/tauri";
import { queryKeys } from "../lib/query-keys";
import { logger } from "../lib/logger";
import {
  normalizeToolkitSlug,
  normalizeToolkitSlugs,
} from "../lib/composio-toolkits";

/**
 * Shared helper for any surface that initiates a Composio OAuth flow
 * by opening a browser (Integrations tab Connect button, inline
 * `ComposioLinkCard` in chat, etc.).
 *
 * `markWaitingForAuth(slug)` does two things:
 *
 *   1. Asks the engine to start a server-side watch on this toolkit.
 *      The engine polls Composio's consumer connections endpoint for
 *      up to 5 minutes and emits `ComposioConnectionAdded` over WS
 *      when the slug appears. That event invalidates the shared
 *      `connectedToolkits` query so every visible card flips at
 *      once. Push-based, no UI lifecycle dependencies.
 *
 *   2. Runs a short client-side polling loop (~60s) as defense in
 *      depth — survives engine restarts mid-OAuth and covers the
 *      brief window before the engine watch is registered.
 */
export function useComposioRefetchOnReturn(): (slug: string) => void {
  const qc = useQueryClient();
  const pollersRef = useRef<Map<string, number>>(new Map());
  const waitingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleRefocus = () => {
      if (waitingRef.current.size === 0) return;
      qc.invalidateQueries({ queryKey: queryKeys.connectedToolkits() });
    };
    window.addEventListener("focus", handleRefocus);
    document.addEventListener("visibilitychange", handleRefocus);
    return () => {
      window.removeEventListener("focus", handleRefocus);
      document.removeEventListener("visibilitychange", handleRefocus);
    };
  }, [qc]);

  useEffect(() => {
    const pollers = pollersRef.current;
    return () => {
      for (const handle of pollers.values()) {
        window.clearInterval(handle);
      }
      pollers.clear();
    };
  }, []);

  return useCallback(
    (slug: string) => {
      const targetSlug = normalizeToolkitSlug(slug);
      if (!targetSlug) return;

      // Push-path: ask the engine to watch. Fires
      // `ComposioConnectionAdded` over WS when the connection lands.
      // Idempotent server-side, so duplicate calls (chat card +
      // integrations tab racing on the same toolkit) collapse into
      // one watch.
      void tauriConnections.watchConnection(targetSlug).catch(() => {
        // Engine watch is best-effort. The pull-path below covers the
        // failure case.
      });

      if (pollersRef.current.has(targetSlug)) return;

      waitingRef.current.add(targetSlug);
      let attempts = 0;
      const MAX_ATTEMPTS = 15;
      const INTERVAL_MS = 4000;

      const stop = () => {
        const handle = pollersRef.current.get(targetSlug);
        if (handle !== undefined) {
          window.clearInterval(handle);
          pollersRef.current.delete(targetSlug);
        }
        waitingRef.current.delete(targetSlug);
      };

      const tick = async () => {
        attempts += 1;
        try {
          const connected = normalizeToolkitSlugs(
            await tauriConnections.listConnectedToolkits(),
          );
          if (connected.includes(targetSlug)) {
            qc.setQueryData(queryKeys.connectedToolkits(), connected);
            await qc.invalidateQueries({
              queryKey: queryKeys.connectedToolkits(),
            });
            stop();
            return;
          }
        } catch (e) {
          logger.warn(`[composio] poll for ${targetSlug} failed: ${String(e)}`);
        }
        if (attempts >= MAX_ATTEMPTS) {
          stop();
        }
      };

      const handle = window.setInterval(tick, INTERVAL_MS);
      pollersRef.current.set(targetSlug, handle);
      void tick();
    },
    [qc],
  );
}
