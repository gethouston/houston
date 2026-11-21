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

const COMMIT_INTERVAL_MS = 120;

interface UseMissionHistoryScanOptions {
  items: KanbanItem[];
  phrase: string;
  loadHistory: (
    sessionKey: string,
    opts?: HistoryLoadOptions,
  ) => Promise<FeedItem[]>;
  onHistoryLoadError?: () => void;
}

export interface MissionHistoryScan {
  historyById: Record<string, SearchableText>;
  isScanning: boolean;
}

function sessionKeyFor(item: KanbanItem): string {
  const key = item.metadata?.sessionKey;
  return typeof key === "string" ? key : `activity-${item.id}`;
}

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
