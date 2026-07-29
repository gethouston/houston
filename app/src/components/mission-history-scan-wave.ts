import { runPool } from "../lib/async-pool.ts";
import { matchesPhrase } from "./mission-highlight.ts";

/** Transcript loads in flight at once: enough to hide per-request latency,
 *  few enough that a big board never opens one request per mission at once. */
export const SCAN_CONCURRENCY = 5;

/**
 * The slice of a board item a scan wave reasons about. Deliberately minimal:
 * everything else on a card (status, people, icon) is the board's business, and
 * keeping the shape this small is what lets the wave logic stay free of React,
 * of the board package, and of the DOM — so it can be unit-tested directly.
 */
export interface ScanItem {
  id: string;
  title: string;
  description?: string;
}

export interface MissionHistoryScannerPorts<T extends ScanItem> {
  /**
   * Loads one mission's transcript, already folded into the text the search
   * runs over. MAY reject: a rejection is recorded as an empty transcript (so
   * the mission is not retried on every keystroke) and surfaced once per wave.
   */
  loadTranscript: (item: T) => Promise<string>;
  /** A transcript ("" for a failed load) is ready for `id`. */
  onTranscript: (id: string, text: string) => void;
  /** Called ONLY when the spinner actually flips — this drives a whole board's
   *  re-render, and every settled transcript passes through here. */
  onScanningChange: (scanning: boolean) => void;
  /** At least one load in a wave failed. Fired once per wave, never per item. */
  onLoadError: () => void;
  /** Overridable for tests; production uses {@link SCAN_CONCURRENCY}. */
  concurrency?: number;
}

export interface MissionHistoryScanner<T extends ScanItem> {
  /** Point the scanner at the current board + phrase and launch what is
   *  missing. Safe (and expected) to call on every render. */
  scan: (items: readonly T[], phrase: string) => void;
  /** Unmounted: stop starting work. In-flight loads still commit. */
  stop: () => void;
}

/**
 * Owns the bookkeeping behind the mission transcript scan: which missions are
 * already scanned, which are claimed by a running wave, how many are still
 * pending, and which phrase (the wave's generation) the board is scanning for.
 *
 * Kept hook-free on purpose. The React hook above it holds only the two pieces
 * of state a component needs — the transcript map and the spinner — and hands
 * this module the ports; every ordering hazard (a phrase superseded mid-wave)
 * then lives in one place that a plain node:test can drive.
 */
export function createMissionHistoryScanner<T extends ScanItem>(
  ports: MissionHistoryScannerPorts<T>,
): MissionHistoryScanner<T> {
  const limit = ports.concurrency ?? SCAN_CONCURRENCY;
  /** Missions whose transcript is loaded (or failed — recorded as empty). */
  const scanned = new Set<string>();
  /** Missions claimed by a running wave, released when it settles or stops. */
  const claimed = new Set<string>();
  let remaining = 0;
  let scanning = false;
  let stopped = false;
  /** The phrase the board is scanning for right now — a wave's generation. */
  let phrase = "";
  let items: readonly T[] = [];

  /** Publish the spinner only when it flips, never once per settled item. */
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
    // Missions the phrase already matches by title or description need no
    // transcript: they are shown as hits regardless of what the chat says.
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
          // Record the failure as an empty transcript so the mission is not
          // retried on every keystroke; the toast below tells the user.
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
    // Release whatever this wave never got to (superseded phrase / unmount).
    for (const item of wave) {
      if (claimed.delete(item.id)) remaining -= 1;
    }
    // Then pick those releases straight back up for whatever phrase is current.
    // A superseded wave settles LONG after the phrase that replaced it looked at
    // the board: that wave saw these missions still claimed, skipped them, and
    // nothing re-triggers it (the board and the phrase have not changed since).
    // Without this re-launch, typing fast enough to supersede a wave left most
    // transcripts unread while the spinner reported "search complete".
    //
    // This terminates: a re-launch only starts a load for a mission that is
    // neither scanned nor claimed, and every STARTED load ends in `scanned`
    // (success commits its text, failure commits ""), so each round strictly
    // shrinks the unscanned set. A round with nothing missing starts no pool and
    // therefore chains no further round.
    if (!stopped && phrase) launch(phrase);
    syncScanning();
    if (failed) ports.onLoadError();
  };

  return {
    scan(nextItems, nextPhrase) {
      if (stopped) return;
      // Every wave is tagged with the phrase that launched it: as soon as a new
      // phrase (or an emptied box) lands here, the running wave stops starting
      // work. In-flight loads are still committed — a transcript is a fact about
      // the mission, not about the phrase, so the next wave reuses it.
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
