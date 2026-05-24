import { useEffect, useMemo, useRef, useState } from "react";
import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import {
  buildMissionHistorySearchText,
  normalizeMissionSearchQuery,
  searchMissions,
} from "./mission-search";

interface UseMissionSearchOptions {
  items: KanbanItem[];
  query: string;
  loadHistory: (sessionKey: string) => Promise<FeedItem[]>;
  onHistoryLoadError?: () => void;
}

function sessionKeyFor(item: KanbanItem): string {
  const key = item.metadata?.sessionKey;
  return typeof key === "string" ? key : `activity-${item.id}`;
}

export function useMissionSearch({
  items,
  query,
  loadHistory,
  onHistoryLoadError,
}: UseMissionSearchOptions) {
  const [historyTextById, setHistoryTextById] = useState<
    Record<string, string>
  >({});
  const [pendingCount, setPendingCount] = useState(0);
  const loadingIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const normalizedQuery = normalizeMissionSearchQuery(query);

  const result = useMemo(
    () => searchMissions(items, query, historyTextById),
    [items, query, historyTextById],
  );

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!normalizedQuery || result.mode === "title") return;
    const missing = items.filter(
      (item) =>
        historyTextById[item.id] === undefined &&
        !loadingIdsRef.current.has(item.id),
    );
    if (missing.length === 0) return;

    for (const item of missing) loadingIdsRef.current.add(item.id);
    setPendingCount((count) => count + missing.length);

    Promise.allSettled(
      missing.map(async (item) => {
        const history = await loadHistory(sessionKeyFor(item));
        return [item.id, buildMissionHistorySearchText(history)] as const;
      }),
    )
      .then((settled) => {
        const next: Record<string, string> = {};
        let failed = false;

        settled.forEach((entry, index) => {
          const item = missing[index];
          if (entry.status === "fulfilled") {
            const [id, text] = entry.value;
            next[id] = text;
            return;
          }
          console.error("[mission-search] history load failed", entry.reason);
          next[item.id] = "";
          failed = true;
        });

        if (!mountedRef.current) return;
        setHistoryTextById((prev) => ({ ...prev, ...next }));
        if (failed) onHistoryLoadError?.();
      })
      .finally(() => {
        for (const item of missing) loadingIdsRef.current.delete(item.id);
        if (mountedRef.current) {
          setPendingCount((count) => Math.max(0, count - missing.length));
        }
      });
  }, [
    historyTextById,
    items,
    loadHistory,
    normalizedQuery,
    onHistoryLoadError,
    result.mode,
  ]);

  return {
    items: result.items,
    mode: result.mode,
    hasQuery: result.hasQuery,
    isSearchingText: result.mode === "text" && pendingCount > 0,
  };
}
