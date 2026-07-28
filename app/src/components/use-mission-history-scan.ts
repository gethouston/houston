import type { KanbanItem } from "@houston-ai/board";
import type { FeedItem } from "@houston-ai/chat";
import { useCallback, useEffect, useRef, useState } from "react";
import { runPool } from "../lib/async-pool";
import type { HistoryLoadOptions } from "../lib/tauri";
import { matchesPhrase } from "./mission-highlight";
import { buildMissionHistorySearchText } from "./mission-search";
import { type SearchableText, toSearchableText } from "./mission-search-text";

/** Transcript loads in flight at once: enough to hide per-request latency,
 *  few enough that a big board never opens one request per mission at once. */
const SCAN_CONCURRENCY = 5;

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
 * The wave is bounded ({@link SCAN_CONCURRENCY}) and streams: each transcript
 * is folded and committed as it settles, so matches appear while the rest is
 * still loading. Changing the phrase or unmounting stops the wave from starting
 * more work — its generation no longer matches, and the next phrase re-scans
 * only what is still missing (transcripts are cached by mission id).
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
  const scanningRef = useRef(false);
  /** Missions whose transcript is loaded (or failed — recorded as empty). */
  const scannedRef = useRef<Set<string>>(new Set());
  /** Missions claimed by the running wave, released when it settles or stops. */
  const claimedRef = useRef<Set<string>>(new Set());
  const bufferRef = useRef<Record<string, SearchableText>>({});
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(0);
  /** The phrase the board is scanning for right now — a wave's generation. */
  const phraseRef = useRef("");
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (flushRef.current !== null) clearTimeout(flushRef.current);
    };
  }, []);

  /** Publish the spinner only when it actually flips — this hook sits above a
   *  whole board, and every settled transcript calls in here. */
  const syncScanning = useCallback(() => {
    const next = remainingRef.current > 0;
    if (scanningRef.current === next) return;
    scanningRef.current = next;
    if (mountedRef.current) setIsScanning(next);
  }, []);

  const flush = useCallback(() => {
    flushRef.current = null;
    const batch = bufferRef.current;
    bufferRef.current = {};
    if (!mountedRef.current || Object.keys(batch).length === 0) return;
    setHistoryById((prev) => ({ ...prev, ...batch }));
  }, []);

  const commit = useCallback(
    (id: string, text: string) => {
      bufferRef.current[id] = toSearchableText(text);
      scannedRef.current.add(id);
      claimedRef.current.delete(id);
      remainingRef.current -= 1;
      syncScanning();
      if (flushRef.current === null) {
        flushRef.current = setTimeout(flush, COMMIT_INTERVAL_MS);
      }
    },
    [flush, syncScanning],
  );

  useEffect(() => {
    // Every wave is tagged with the phrase that launched it: as soon as a new
    // phrase (or an emptied box) lands here, the running wave stops starting
    // work. In-flight loads are still committed — a transcript is a fact about
    // the mission, not about the phrase, so the next wave reuses it.
    phraseRef.current = phrase;
    if (!phrase) {
      syncScanning();
      return;
    }
    const missing = items.filter(
      (item) =>
        !scannedRef.current.has(item.id) &&
        !claimedRef.current.has(item.id) &&
        !matchesPhrase(item.title, phrase) &&
        !matchesPhrase(item.description, phrase),
    );
    if (missing.length === 0) return;

    for (const item of missing) claimedRef.current.add(item.id);
    remainingRef.current += missing.length;
    syncScanning();

    let failed = false;
    void runPool(
      missing,
      SCAN_CONCURRENCY,
      async (item) => {
        try {
          const history = await loadHistory(sessionKeyFor(item), {
            observe: false,
          });
          commit(item.id, buildMissionHistorySearchText(history));
        } catch (err) {
          console.error("[mission-search] history load failed", err);
          // Record the failure as an empty transcript so the mission is not
          // retried on every keystroke; the toast below tells the user.
          commit(item.id, "");
          failed = true;
        }
      },
      () => !mountedRef.current || phraseRef.current !== phrase,
    ).then(() => {
      // Release whatever this wave never got to (superseded phrase / unmount).
      for (const item of missing) {
        if (claimedRef.current.delete(item.id)) remainingRef.current -= 1;
      }
      syncScanning();
      if (failed) onHistoryLoadError?.();
    });
  }, [commit, items, loadHistory, onHistoryLoadError, phrase, syncScanning]);

  return { historyById, isScanning };
}
