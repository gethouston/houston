import type { TriggerStatusItem } from "@houston/engine-adapter";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TRIGGER_STATUS_TIMEOUT_MS,
  timedOutTriggerIds,
  toStatusMap,
  withTriggerTimeouts,
} from "./routine-trigger-maps";

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
