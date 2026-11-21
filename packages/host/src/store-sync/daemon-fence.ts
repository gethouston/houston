import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FENCE_RETIRED_MARKER, type RetireMarker } from "./daemon-hydrate";
import type { StoreSyncOptions } from "./daemon-policy";
import { WriteFence } from "./write-fence";

export function createDaemonFence(
  opts: StoreSyncOptions,
  halt: (err: { message: string }) => void,
  syncedKeys: () => Iterable<string>,
): WriteFence {
  return new WriteFence({
    probe: opts.leaseProbe,
    claimed: opts.leaseClaimed,
    heartbeatMs: opts.leaseHeartbeatMs,
    onLost: halt,
    onHolder: (holder) => {
      if (holder === "stale") markRetired(opts, syncedKeys());
      opts.onFenceLost?.(holder);
    },
    log: opts.log,
  });
}

function markRetired(opts: StoreSyncOptions, synced: Iterable<string>): void {
  const marker: RetireMarker = {
    retiredAt: new Date().toISOString(),
    synced: [...synced],
  };
  try {
    writeFileSync(
      join(opts.rootDir, FENCE_RETIRED_MARKER),
      JSON.stringify(marker),
    );
  } catch (err) {
    opts.log(
      "[store-sync] could not mark the fence retire; the next boot keeps local files the store lacks",
      err,
    );
  }
}
