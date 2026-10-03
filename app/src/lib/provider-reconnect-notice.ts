/**
 * The shell's "sign in again soon" notice, read off the probed provider
 * statuses. The rules (which deadline, how many days ahead, when the count
 * next changes) are the SDK's; this only hands them the app's status shape.
 */

import {
  nextReconnectNoticeChange,
  type ProviderLoginStatus,
  type ProviderReconnectNotice,
  providerReconnectNotices,
} from "@houston/sdk";
import type { ProviderStatus } from "./tauri";

function loginStatuses(
  statuses: Record<string, ProviderStatus>,
): ProviderLoginStatus[] {
  return Object.values(statuses).map((status) => ({
    provider: status.provider,
    connected: status.authenticated,
    reconnectBy: status.reconnectBy,
  }));
}

/** The soonest due notice among `statuses`, or null. */
export function providerReconnectNoticeFor(
  statuses: Record<string, ProviderStatus>,
  now: number,
): ProviderReconnectNotice | null {
  return providerReconnectNotices(loginStatuses(statuses), now)[0] ?? null;
}

/** When the notice next changes with no new status, or null. */
export function nextReconnectNoticeChangeFor(
  statuses: Record<string, ProviderStatus>,
  now: number,
): number | null {
  return nextReconnectNoticeChange(loginStatuses(statuses), now);
}
