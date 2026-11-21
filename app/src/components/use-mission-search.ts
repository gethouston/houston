import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useEffect, useMemo, useRef } from "react";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { analytics } from "../lib/analytics";
import type { HistoryLoadOptions } from "../lib/tauri";
import { matchesPhrase } from "./mission-highlight";
import { normalizeMissionSearchQuery, searchMissions } from "./mission-search";
import { useMissionHistoryScan } from "./use-mission-history-scan";

const SCAN_DEBOUNCE_MS = 250;

interface UseMissionSearchOptions {
  items: KanbanItem[];
  query: string;
  loadHistory: (
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) => Promise<FeedItem[]>;
  onHistoryLoadError?: () => void;
}

export function useMissionSearch({
  items,
  query,
  loadHistory,
  onHistoryLoadError,
}: UseMissionSearchOptions) {
  const phrase = normalizeMissionSearchQuery(query);
  const debouncedPhrase = useDebouncedValue(phrase, SCAN_DEBOUNCE_MS);
  const scanPhrase = phrase ? debouncedPhrase : "";

  const { historyById, isScanning } = useMissionHistoryScan({
    items,
    phrase: scanPhrase,
    loadHistory,
    onHistoryLoadError,
  });

  const result = useMemo(
    () => searchMissions(items, query, historyById),
    [items, query, historyById],
  );

  const searchingRef = useRef(false);
  useEffect(() => {
    if (phrase && !searchingRef.current) {
      searchingRef.current = true;
      analytics.track("search_performed", { surface: "missions" });
    } else if (!phrase) {
      searchingRef.current = false;
    }
  }, [phrase]);

  const scanPending =
    phrase !== scanPhrase &&
    items.some(
      (item) =>
        historyById[item.id] === undefined &&
        !matchesPhrase(item.title, phrase) &&
        !matchesPhrase(item.description, phrase),
    );

  return {
    items: result.items,
    hasQuery: result.hasQuery,
    snippets: result.snippets,
    isSearchingText: phrase !== "" && (isScanning || scanPending),
  };
}
