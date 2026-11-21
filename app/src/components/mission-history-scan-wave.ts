import { runPool } from "../lib/async-pool.ts";
import { matchesPhrase } from "./mission-highlight.ts";

export const SCAN_CONCURRENCY = 5;

export interface ScanItem {
  id: string;
  title: string;
  description?: string;
}

export interface MissionHistoryScannerPorts<T extends ScanItem> {
  loadTranscript: (item: T) => Promise<string>;
  onTranscript: (id: string, text: string) => void;
  onScanningChange: (scanning: boolean) => void;
  onLoadError: () => void;
  concurrency?: number;
}

export interface MissionHistoryScanner<T extends ScanItem> {
  scan: (items: readonly T[], phrase: string) => void;
  stop: () => void;
}

export function createMissionHistoryScanner<T extends ScanItem>(
  ports: MissionHistoryScannerPorts<T>,
): MissionHistoryScanner<T> {
  const limit = ports.concurrency ?? SCAN_CONCURRENCY;
  const scanned = new Set<string>();
  const claimed = new Set<string>();
  let remaining = 0;
  let scanning = false;
  let stopped = false;
  let phrase = "";
  let items: readonly T[] = [];

  const syncScanning = (): void => {
    const next = remaining > 0;
    if (scanning === next) return;
    scanning = next;
    ports.onScanningChange(next);
  };

  const commit = (id: string, text: string): void => {
    scanned.add(id);
    claimed.delete(id);
    remaining -= 1;
    ports.onTranscript(id, text);
    syncScanning();
  };

  const launch = (generation: string): void => {
    const missing = items.filter(
      (item) =>
        !scanned.has(item.id) &&
        !claimed.has(item.id) &&
        !matchesPhrase(item.title, generation) &&
        !matchesPhrase(item.description, generation),
    );
    if (missing.length === 0) {
      syncScanning();
      return;
    }

    for (const item of missing) claimed.add(item.id);
    remaining += missing.length;
    syncScanning();

    let failed = false;
    void runPool(
      missing,
      limit,
      async (item) => {
        try {
          commit(item.id, await ports.loadTranscript(item));
        } catch (err) {
          console.error("[mission-search] history load failed", err);
          commit(item.id, "");
          failed = true;
        }
      },
      () => stopped || phrase !== generation,
    ).then(() => {
      settle(missing, failed);
    });
  };

  const settle = (wave: readonly T[], failed: boolean): void => {
    for (const item of wave) {
      if (claimed.delete(item.id)) remaining -= 1;
    }
    if (!stopped && phrase) launch(phrase);
    syncScanning();
    if (failed) ports.onLoadError();
  };

  return {
    scan(nextItems, nextPhrase) {
      if (stopped) return;
      items = nextItems;
      phrase = nextPhrase;
      if (!phrase) {
        syncScanning();
        return;
      }
      launch(phrase);
    },
    stop() {
      stopped = true;
    },
  };
}
