import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useEffect, useMemo, useRef, useState } from "react";
import { matchesPhrase } from "./mission-highlight";
import {
  buildMissionHistorySearchText,
  normalizeMissionSearchQuery,
  searchMissions,
} from "./mission-search";

interface UseMissionSearchOptions {
  items: KanbanItem[];
  query: string;
  /**
   * Must forward the options to the history loader: search loads N missions'
   * histories at a time and passes `observe: false` so the new-engine adapter
   * doesn't spawn N observer streams (that's for real conversation opens).
   */
  loadHistory: (
    sessionKey: string,
    opts?: { observe?: boolean },
  ) => Promise<FeedItem[]>;
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
  const phrase = normalizeMissionSearchQuery(query);

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
    if (!phrase) return;
    // Load chat history only for missions that don't already match by title or
    // description, so matches deeper in the conversation (including the user's
    // own messages) still surface — even when other missions match by title.
    const missing = items.filter(
      (item) =>
        !matchesPhrase(item.title, phrase) &&
        !matchesPhrase(item.description, phrase) &&
        historyTextById[item.id] === undefined &&
        !loadingIdsRef.current.has(item.id),
    );
    if (missing.length === 0) return;

    for (const item of missing) loadingIdsRef.current.add(item.id);
    setPendingCount((count) => count + missing.length);

    Promise.allSettled(
      missing.map(async (item) => {
        const history = await loadHistory(sessionKeyFor(item), {
          observe: false,
        });
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
  }, [historyTextById, items, loadHistory, phrase, onHistoryLoadError]);

  return {
    items: result.items,
    hasQuery: result.hasQuery,
    snippets: result.snippets,
    isSearchingText: pendingCount > 0,
  };
}
