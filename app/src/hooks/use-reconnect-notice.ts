import type { ProviderReconnectNotice } from "@houston/sdk";
import { useEffect, useReducer } from "react";
import {
  nextReconnectNoticeChangeFor,
  providerReconnectNoticeFor,
} from "../lib/provider-reconnect-notice";
import type { ProviderStatus } from "../lib/tauri";

/**
 * A timer this long re-reads the clock even when the next change is further
 * off: a laptop that slept past it fires it late, and the re-read catches up.
 */
export const RECONNECT_NOTICE_MAX_WAIT_MS = 60 * 60 * 1000;

/**
 * The reconnect notice for `statuses`, kept current as time passes: the SDK
 * says when the notice next changes on its own (`nextReconnectNoticeChange`)
 * and this re-renders then, so an open window shows the right day without a
 * refetch.
 */
export function useReconnectNotice(
  statuses: Record<string, ProviderStatus>,
): ProviderReconnectNotice | null {
  const [tick, rerender] = useReducer((n: number) => n + 1, 0);
  const now = Date.now();
  const notice = providerReconnectNoticeFor(statuses, now);
  const next = nextReconnectNoticeChangeFor(statuses, now);

  // `tick` re-arms the timer after a capped wait, when `next` is unchanged.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is read only to re-run the effect after each wake
  useEffect(() => {
    if (next === null) return;
    const wait = Math.min(
      Math.max(next - Date.now(), 0),
      RECONNECT_NOTICE_MAX_WAIT_MS,
    );
    const timer = setTimeout(rerender, wait);
    return () => clearTimeout(timer);
  }, [next, tick]);

  return notice;
}
