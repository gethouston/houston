import type { ProviderReconnectNotice } from "@houston/sdk";
import { useEffect, useReducer } from "react";
import {
  nextReconnectNoticeChangeFor,
  providerReconnectNoticeFor,
} from "../lib/provider-reconnect-notice";
import type { ProviderStatus } from "../lib/tauri";

export const RECONNECT_NOTICE_MAX_WAIT_MS = 60 * 60 * 1000;

export function useReconnectNotice(
  statuses: Record<string, ProviderStatus>,
): ProviderReconnectNotice | null {
  const [tick, rerender] = useReducer((n: number) => n + 1, 0);
  const now = Date.now();
  const notice = providerReconnectNoticeFor(statuses, now);
  const next = nextReconnectNoticeChangeFor(statuses, now);

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
