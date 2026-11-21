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

export function providerReconnectNoticeFor(
  statuses: Record<string, ProviderStatus>,
  now: number,
): ProviderReconnectNotice | null {
  return providerReconnectNotices(loginStatuses(statuses), now)[0] ?? null;
}

export function nextReconnectNoticeChangeFor(
  statuses: Record<string, ProviderStatus>,
  now: number,
): number | null {
  return nextReconnectNoticeChange(loginStatuses(statuses), now);
}
