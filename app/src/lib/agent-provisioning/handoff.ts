import {
  openWarmingReads,
  type ProvisioningEntry,
  warmingFlushRefetchKeys,
} from "./entry.ts";

export interface WarmupHandoffDeps {
  /** Deliver the queued sends (`flushWarmingSends`). */
  flush: (entry: ProvisioningEntry) => Promise<void>;
  /** Refetch one query key and settle when its data landed. */
  refetch: (queryKey: readonly unknown[]) => Promise<unknown>;
  /** Drop the entry, and with it the optimistic rows. */
  clear: () => void;
}

/**
 * The engine answered: hand the warming entry off to the real engine state.
 *
 * The queued messages go out FIRST, so their turns register before any new
 * composer send can. Then the reads open to the engine and every key in
 * `warmingFlushRefetchKeys` refetches; the entry clears only once those land,
 * so the optimistic rows hand off to the real rows the flush wrote without a
 * one-frame gap (HOU-713), and the first-day placement, held while the entry
 * is up, settles on the real config.
 */
export async function completeWarmupHandoff(
  entry: ProvisioningEntry,
  deps: WarmupHandoffDeps,
): Promise<void> {
  try {
    await deps.flush(entry);
    openWarmingReads(entry);
    await Promise.all(
      warmingFlushRefetchKeys(entry.agentPath).map((key) => deps.refetch(key)),
    );
  } finally {
    deps.clear();
  }
}
