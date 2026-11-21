import {
  openWarmingReads,
  type ProvisioningEntry,
  warmingFlushRefetchKeys,
} from "./entry.ts";

export interface WarmupHandoffDeps {
  flush: (entry: ProvisioningEntry) => Promise<void>;
  refetch: (queryKey: readonly unknown[]) => Promise<unknown>;
  clear: () => void;
}

const handedOff = new WeakSet<ProvisioningEntry>();

export function handOffOnce(
  entry: ProvisioningEntry,
  deps: WarmupHandoffDeps,
): Promise<void> | null {
  if (handedOff.has(entry)) return null;
  handedOff.add(entry);
  return completeWarmupHandoff(entry, deps);
}

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
