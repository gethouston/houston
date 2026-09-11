import type { TriggerStatusItem } from "@houston-ai/engine-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TRIGGER_STATUS_TIMEOUT_MS,
  timedOutTriggerIds,
  toStatusMap,
  withTriggerTimeouts,
} from "./routine-trigger-maps";

/**
 * The ONE machinery that stops a trigger routine saying "verifying" forever:
 * the per-row status map with a concrete error overlaid on every routine whose
 * status has been absent past the verification timeout.
 *
 * A trigger routine that never gets a status item would otherwise spin without
 * end — an older host, a create that silently failed, or an agent whose trigger
 * rows the backend cannot see (PRODUCT-1772: the routine screen's activation
 * chip read the raw status and had no timeout at all, so a moved agent's
 * webhook routine showed "Checking your trigger…" across restarts). Every
 * surface that renders a trigger status resolves it through here — the grid's
 * row badges via the view model, the routine screen's chip directly — so no
 * second copy of the timeout rule can drift.
 *
 * `triggerRowIds` are the rows that can sit in a "verifying" state at all;
 * `statusItems` is the fetched list (`null` when the host serves no triggers).
 * Tracks when each row first appears WITHOUT a status, and once that has lasted
 * past the timeout, synthesizes the error so the row/chip stop spinning. A real
 * status item, when it finally lands, always wins.
 */
export function useTriggerStatusTimeouts(
  triggerRowIds: string[],
  statusItems: TriggerStatusItem[] | null | undefined,
): Record<string, TriggerStatusItem> {
  const { t } = useTranslation("routines");
  const firstSeenRef = useRef<Record<string, number>>({});
  const [timeoutTick, setTimeoutTick] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const ids = new Set(triggerRowIds);
    const known = new Set((statusItems ?? []).map((i) => i.routine_id));
    const seen = firstSeenRef.current;
    for (const id of triggerRowIds) {
      if (!known.has(id) && seen[id] === undefined) seen[id] = now;
    }
    for (const id of Object.keys(seen)) {
      if (!ids.has(id) || known.has(id)) delete seen[id];
    }
    // Force one re-evaluation at the earliest pending timeout, so a routine
    // that goes quiet still flips to the error copy even if no poll lands then.
    const waits = Object.values(seen)
      .map((seenAt) => seenAt + TRIGGER_STATUS_TIMEOUT_MS - now)
      .filter((ms) => ms > 0);
    if (waits.length === 0) return;
    const timer = setTimeout(
      () => setTimeoutTick((n) => n + 1),
      Math.min(...waits),
    );
    return () => clearTimeout(timer);
  }, [triggerRowIds, statusItems]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: timeoutTick is a deliberate recompute trigger — the body reads firstSeenRef.current + Date.now() live, and the timer bumps timeoutTick so an elapsed timeout flips the routine to the error copy.
  return useMemo(() => {
    const base = toStatusMap(statusItems);
    const timedOut = timedOutTriggerIds(
      triggerRowIds,
      statusItems,
      firstSeenRef.current,
      Date.now(),
    );
    return withTriggerTimeouts(base, timedOut, t("trigger.statusTimeout"));
  }, [statusItems, triggerRowIds, timeoutTick, t]);
}
