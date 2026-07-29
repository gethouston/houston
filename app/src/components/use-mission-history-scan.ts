import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useEffect, useRef, useState } from "react";
import type { HistoryLoadOptions } from "../lib/tauri.ts";
import {
  createMissionHistoryScanner,
  type MissionHistoryScanner,
} from "./mission-history-scan-wave.ts";
import { buildMissionHistorySearchText } from "./mission-search.ts";
import {
  type SearchableText,
  toSearchableText,
} from "./mission-search-text.ts";

/** Loaded transcripts are committed in windows of this long, so results stream
 *  onto the board as they land without re-rendering it once per mission. */
const COMMIT_INTERVAL_MS = 120;

interface UseMissionHistoryScanOptions {
  items: KanbanItem[];
  /** The already-normalized, already-DEBOUNCED phrase. "" scans nothing. */
  phrase: string;
  /**
   * Must forward the options to the history loader: the scan passes
   * `observe: false`, which marks a BULK read — the engine adapter then reads a
   * bounded scan window and spawns no observer stream (those are for real
   * conversation opens).
   */
  loadHistory: (
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) => Promise<FeedItem[]>;
  onHistoryLoadError?: () => void;
}

export interface MissionHistoryScan {
  /** `item.id` -> its pre-folded transcript. Absent = not scanned yet. */
  historyById: Record<string, SearchableText>;
  /** A scan wave is still running (some missions are not searched yet). */
  isScanning: boolean;
}

function sessionKeyFor(item: KanbanItem): string {
  const key = item.metadata?.sessionKey;
  return typeof key === "string" ? key : `activity-${item.id}`;
}

/**
 * Loads the chat history of every mission the phrase does NOT already match by
 * title or description, so matches deeper in the conversation (including the
 * user's own messages) still surface.
 *
 * The wave logic itself lives in `mission-history-scan-wave.ts` (bounded
 * concurrency, per-phrase generations, claim/release, re-launch of what a
 * superseded wave never started). This hook is only the React skin on top of
 * it: it owns the two pieces of state a component renders and buffers the
 * commits so a landing transcript does not re-render the whole board.
 */
export function useMissionHistoryScan({
  items,
  phrase,
  loadHistory,
  onHistoryLoadError,
}: UseMissionHistoryScanOptions): MissionHistoryScan {
  const [historyById, setHistoryById] = useState<
    Record<string, SearchableText>
  >({});
  const [isScanning, setIsScanning] = useState(false);
  const bufferRef = useRef<Record<string, SearchableText>>({});
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  /** The scanner reads the CALLERS' latest functions through this ref: it holds
   *  the scan's whole memory (what is scanned, what is claimed), so a parent
   *  that hands us a fresh `loadHistory` identity must not cost us that memory. */
  const portsRef = useRef({ loadHistory, onHistoryLoadError });

  const scannerRef = useRef<MissionHistoryScanner<KanbanItem> | null>(null);
  if (scannerRef.current === null) {
    const flush = () => {
      flushRef.current = null;
      const batch = bufferRef.current;
      bufferRef.current = {};
      if (!mountedRef.current || Object.keys(batch).length === 0) return;
      setHistoryById((prev) => ({ ...prev, ...batch }));
    };
    scannerRef.current = createMissionHistoryScanner<KanbanItem>({
      loadTranscript: async (item) => {
        const history = await portsRef.current.loadHistory(
          sessionKeyFor(item),
          {
            observe: false,
          },
        );
        return buildMissionHistorySearchText(history);
      },
      onTranscript: (id, text) => {
        bufferRef.current[id] = toSearchableText(text);
        if (flushRef.current === null) {
          flushRef.current = setTimeout(flush, COMMIT_INTERVAL_MS);
        }
      },
      onScanningChange: (scanning) => {
        if (mountedRef.current) setIsScanning(scanning);
      },
      onLoadError: () => portsRef.current.onHistoryLoadError?.(),
    });
  }

  // Declared BEFORE the scan effect so a wave launched below always reaches the
  // loader this render was given, never the previous one.
  useEffect(() => {
    portsRef.current = { loadHistory, onHistoryLoadError };
  }, [loadHistory, onHistoryLoadError]);

  useEffect(() => {
    scannerRef.current?.scan(items, phrase);
  }, [items, phrase]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      scannerRef.current?.stop();
      if (flushRef.current !== null) clearTimeout(flushRef.current);
    };
  }, []);

  return { historyById, isScanning };
}
