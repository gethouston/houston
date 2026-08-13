// WHICH device a usage point is credited to.
//
// The record keeps its points per device (`usageByDevice`) so two machines that
// earn on the same day are both right and merging never has to throw one of
// them away. That only works if the key is a property of the MACHINE: anything
// the account carries with it — the engine's preference store, which in hosted
// mode is one pod per user — hands every device the same key and collapses the
// counters back into the single total they were split out of.
//
// So the key is minted here, lazily, into the device's own plain storage: not
// keyed by uid (the machine is the machine whoever signs in) and never written
// to the engine. It identifies nothing about the person and is never sent
// anywhere; `install_id` remains the analytics identity, untouched.

import { UNKNOWN_DEVICE_ID } from "./academy-mutations.ts";

/** The device's own storage, injected so the rule is driven without a browser. */
export interface UsageDeviceStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export const USAGE_DEVICE_KEY = "houston_academy_device";

/**
 * This device's key for the usage counters, minted on first use and kept.
 *
 * A device whose storage refuses to answer, or to hold what it is given, earns
 * under {@link UNKNOWN_DEVICE_ID} instead: an id that cannot be written down is
 * a new id every launch, which scatters one device's points across a growing
 * pile of counters — the opposite of what keeping them per device is for.
 */
export function usageDeviceId(
  store: UsageDeviceStore,
  mint: () => string,
): string {
  try {
    const stored = store.read(USAGE_DEVICE_KEY)?.trim();
    if (stored) return stored;
    const minted = mint().trim();
    if (!minted) return UNKNOWN_DEVICE_ID;
    store.write(USAGE_DEVICE_KEY, minted);
    return minted;
  } catch {
    return UNKNOWN_DEVICE_ID; // Disabled storage, or no room left in it.
  }
}
