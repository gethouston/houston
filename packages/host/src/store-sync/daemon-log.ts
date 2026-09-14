import type { SyncResult } from "@houston/runtime-client/object-sync";
import {
  DEFAULT_MAX_HYDRATE_BYTES,
  type StoreSyncOptions,
} from "./daemon-policy";

export function logHydrated(
  opts: StoreSyncOptions,
  objectCount: number,
  startedAt: number,
): void {
  opts.log(
    `[store-sync] hydrated ${objectCount} objects in ${Date.now() - startedAt}ms`,
  );
}

/** Consecutive failed passes before a sync failure reports with its error.
 *  At the 5-min periodic interval this is ~15 min of sustained failure. */
const REPORT_AFTER_FAILURES = 3;

/**
 * One failed pass is a deploy-window blip the next pass absorbs (the gateway
 * restarts, the pod's network tears down): a breadcrumb, not a report
 * (HOUSTON-APP-58V). A streak means the store is actually unreachable — that
 * reports with the error attached.
 */
export function logSyncFailed(
  opts: StoreSyncOptions,
  trigger: string,
  consecutiveFailures: number,
  err: unknown,
): void {
  if (consecutiveFailures >= REPORT_AFTER_FAILURES) {
    opts.log(
      `[store-sync] ${trigger} sync failed ${consecutiveFailures} times in a row; will retry`,
      err,
    );
    return;
  }
  opts.log(
    `[store-sync] ${trigger} sync failed; will retry (${err instanceof Error ? err.message : String(err)})`,
  );
}

/**
 * No error object: fencing loss is a DESIGNED lifecycle outcome (a newer boot
 * owns the prefix — setup pods are superseded routinely) and halting is the
 * correct response. Passing `err` made every takeover a Sentry error via the
 * severity log's failure channel.
 */
export function logFenceLost(
  opts: StoreSyncOptions,
  err: { message: string },
): void {
  opts.log(
    `[store-sync] write fencing lost: another pod owns this agent's store; halting sync (${err.message})`,
  );
}

export function logSyncResult(
  result: SyncResult,
  opts: StoreSyncOptions,
): void {
  for (const skip of result.skipped) {
    opts.log(
      `[store-sync] ${skip.key} exceeds the store's per-object cap and stays pod-local until it changes (${skip.reason})`,
    );
  }
  if (result.conflicts.length > 0) {
    opts.log(
      `[store-sync] sync completed with ${result.conflicts.length} write conflicts`,
    );
  }
  const cap = opts.maxHydrateBytes ?? DEFAULT_MAX_HYDRATE_BYTES;
  if (result.totalBytes > cap * 0.8) {
    const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
    opts.log(
      `[store-sync] agent data is ${mb(result.totalBytes)} MiB of the ` +
        `${mb(cap)} MiB hydration cap — past the cap the agent cannot wake`,
    );
  }
}
