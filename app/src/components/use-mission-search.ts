import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useEffect, useMemo, useRef } from "react";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { analytics } from "../lib/analytics";
import type { HistoryLoadOptions } from "../lib/tauri";
import { matchesPhrase } from "./mission-highlight";
import { normalizeMissionSearchQuery, searchMissions } from "./mission-search";
import { useMissionHistoryScan } from "./use-mission-history-scan";

/**
 * How long typing must pause before the transcript scan fires. Matching what is
 * already loaded stays on the RAW query (it is a regex over pre-folded text, so
 * the board narrows on every keystroke); only the network wave waits (HOU-941).
 */
const SCAN_DEBOUNCE_MS = 250;

interface UseMissionSearchOptions {
  items: KanbanItem[];
  query: string;
  /** Forwarded to {@link useMissionHistoryScan} — see its `loadHistory`. */
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
  // Clearing the box stops the scan at once — there is nothing to wait for.
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

  // One event per search session (empty → non-empty), never per keystroke.
  const searchingRef = useRef(false);
  useEffect(() => {
    if (phrase && !searchingRef.current) {
      searchingRef.current = true;
      analytics.track("search_performed", { surface: "missions" });
    } else if (!phrase) {
      searchingRef.current = false;
    }
  }, [phrase]);

  // Between the last keystroke and the scan wave, the spinner has to stand for
  // the missions nobody has looked inside yet — but only for those: with every
  // transcript already scanned the results are final and the box must be calm.
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
    // An emptied box is never "still searching", even while the loads the last
    // phrase started drain.
    isSearchingText: phrase !== "" && (isScanning || scanPending),
  };
}
