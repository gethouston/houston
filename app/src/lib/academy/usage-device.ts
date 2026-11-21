import { UNKNOWN_DEVICE_ID } from "./academy-mutations.ts";

export interface UsageDeviceStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

export const USAGE_DEVICE_KEY = "houston_academy_device";

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
    return UNKNOWN_DEVICE_ID;
  }
}
