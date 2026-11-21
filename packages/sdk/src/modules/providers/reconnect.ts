export const RECONNECT_NOTICE_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ProviderLoginStatus {
  provider: string;
  connected: boolean;
  reconnectBy?: number;
}

export interface ProviderReconnectNotice {
  provider: string;
  reconnectBy: number;
  daysLeft: number;
}

export function providerReconnectNotice(
  status: ProviderLoginStatus,
  now: number,
): ProviderReconnectNotice | null {
  const { reconnectBy } = status;
  if (!status.connected || reconnectBy === undefined) return null;
  if (!Number.isFinite(reconnectBy)) return null;
  const left = reconnectBy - now;
  if (left > RECONNECT_NOTICE_DAYS * DAY_MS) return null;
  return {
    provider: status.provider,
    reconnectBy,
    daysLeft: Math.max(0, Math.floor(left / DAY_MS)),
  };
}

export function providerReconnectNotices(
  statuses: readonly ProviderLoginStatus[],
  now: number,
): ProviderReconnectNotice[] {
  return statuses
    .map((status) => providerReconnectNotice(status, now))
    .filter((notice): notice is ProviderReconnectNotice => notice !== null)
    .sort((a, b) => a.reconnectBy - b.reconnectBy);
}

export function nextReconnectNoticeChange(
  statuses: readonly ProviderLoginStatus[],
  now: number,
): number | null {
  let next: number | null = null;
  for (const { connected, reconnectBy } of statuses) {
    if (!connected || reconnectBy === undefined) continue;
    if (!Number.isFinite(reconnectBy)) continue;
    const notice = providerReconnectNotice(
      { provider: "", connected, reconnectBy },
      now,
    );
    const at = notice
      ? notice.daysLeft > 0
        ? reconnectBy - notice.daysLeft * DAY_MS + 1
        : null
      : reconnectBy - RECONNECT_NOTICE_DAYS * DAY_MS;
    if (at !== null && (next === null || at < next)) next = at;
  }
  return next;
}
