/**
 * When to ask a person to sign in to an AI provider again BEFORE the provider
 * ends their login.
 *
 * A hosted Claude subscription login dies about 28 days after the person
 * signed in, however often Houston refreshes it. The gateway then signs the
 * account out and every routine on it stops. The gateway knows when the login
 * happened and puts the deadline on the provider status (`reconnectBy`, epoch
 * ms). This is the one rule every surface reads it with, so desktop, web and
 * the AI Manager warn on the same day.
 */

/** How many days before the deadline the warning shows. */
export const RECONNECT_NOTICE_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What the rule reads from one provider's status. */
export interface ProviderLoginStatus {
  provider: string;
  /** Connected for this person right now. */
  connected: boolean;
  /** Epoch ms deadline from the provider status; absent = none known. */
  reconnectBy?: number;
}

/** A connected provider whose login ends soon. */
export interface ProviderReconnectNotice {
  provider: string;
  /** Epoch ms of the deadline. */
  reconnectBy: number;
  /** Whole days left, rounded down: 0 once less than a day is left. */
  daysLeft: number;
}

/**
 * The notice for one provider, or null: not connected (the sign-out already
 * happened and the reconnect card says so), no known deadline, or more than
 * {@link RECONNECT_NOTICE_DAYS} days away.
 */
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

/** Every due notice among `statuses`, soonest deadline first. */
export function providerReconnectNotices(
  statuses: readonly ProviderLoginStatus[],
  now: number,
): ProviderReconnectNotice[] {
  return statuses
    .map((status) => providerReconnectNotice(status, now))
    .filter((notice): notice is ProviderReconnectNotice => notice !== null)
    .sort((a, b) => a.reconnectBy - b.reconnectBy);
}

/**
 * When the notices for `statuses` next change on their own (a window opens,
 * a day ticks down), or null when nothing will without a new status. A
 * surface re-reads {@link providerReconnectNotices} then, so an open window
 * shows the right day without waiting for a refetch.
 */
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
    // Outside the window it opens at RECONNECT_NOTICE_DAYS; inside, the count
    // drops when another whole day has passed, and stops at 0.
    const at = notice
      ? notice.daysLeft > 0
        ? reconnectBy - notice.daysLeft * DAY_MS + 1
        : null
      : reconnectBy - RECONNECT_NOTICE_DAYS * DAY_MS;
    if (at !== null && (next === null || at < next)) next = at;
  }
  return next;
}
