import type { Routine } from "@houston-ai/engine-client";
import type { TriggerStatusItem } from "@houston-ai/routines";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationToolkits } from "../../hooks/queries/use-integrations";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useUIStore } from "../../stores/ui";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import {
  TRIGGER_STATUS_TIMEOUT_MS,
  timedOutTriggerIds,
  toStatusMap,
  toTriggerSummaries,
  triggerBoundRoutineIds,
  withTriggerTimeouts,
} from "./routine-trigger-maps";

/** Exactly the trigger props `RoutinesGrid` takes, plus the capability gate. */
export interface TriggerSurface {
  /** Whether this host can offer NEW event triggers (`capabilities.triggers`). */
  triggersEnabled: boolean;
  /** Live status per ROW id — every trigger row resolves to one, always. */
  triggerStatuses: Record<string, TriggerStatusItem>;
  /** The humanized "what wakes this" line per ROW id. */
  triggerSummaries: Record<string, string>;
  onReconnectTrigger: () => void;
}

/**
 * The event-trigger surface (C9) for ANY list of routines, agent-agnostic: the
 * capability gate, the per-row status badges, the humanized row summaries, the
 * reconnect hand-off, and the machinery that stops a row saying "verifying"
 * forever.
 *
 * It is shared because BOTH surfaces that render `RoutinesGrid` need all of it.
 * The per-agent Automations tab (`use-routine-triggers.tsx`) and a team's
 * cross-agent list (`team-routines/use-team-trigger-statuses.ts`) differ only in
 * how they FETCH status — one agent versus a fan-out — so the fetch stays with
 * them and everything downstream of it lives here. Copying the timeout rule into
 * the second surface would be the one duplication we cannot afford: it is the
 * only reason a trigger row cannot lie.
 *
 * The contract, and the reason this works for a merged list: `routines[i].id`
 * and `statusItems[j].routine_id` are both the GRID's row id. The tab's row id
 * is the routine's own id, so it passes both through untouched; the team list
 * namespaces its rows with `teamRoutineKey`, so it re-keys the status reads to
 * match before handing them over.
 *
 * `triggersEnabled` gates ONLY offering NEW event triggers (the wizard's event
 * option and the app catalog). Status runs off the routines themselves: a
 * routine that can never fire here must still show its health (an older host
 * 404s -> the rows fall back to the unknown state, then time out).
 */
export function useTriggerStatusViewModel(
  routines: Routine[] | undefined,
  statusItems: TriggerStatusItem[] | null | undefined,
): TriggerSurface {
  const { t } = useTranslation("routines");
  const { capabilities } = useCapabilities();
  const triggersEnabled = !!capabilities?.triggers;

  // The rows that can sit in a "verifying" state at all — the only ones the
  // timeout below has anything to say about.
  const triggerRowIds = useMemo(
    () => triggerBoundRoutineIds(routines),
    [routines],
  );

  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, triggersEnabled);

  const setViewMode = useUIStore((s) => s.setViewMode);
  const onReconnectTrigger = useCallback(() => {
    // Same routing the Integrations tab's "Manage all" uses: the global
    // Integrations page, which everyone can reach.
    setViewMode(INTEGRATIONS_VIEW_ID);
  }, [setViewMode]);

  // A trigger routine that never gets a status item would otherwise say
  // "verifying" forever (an older host, a create that silently failed). Track
  // when each first appears WITHOUT a status, and once that has lasted past the
  // timeout, synthesize a concrete error so the row/chip stop spinning.
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
  const triggerStatuses = useMemo(() => {
    const base = toStatusMap(statusItems);
    const timedOut = timedOutTriggerIds(
      triggerRowIds,
      statusItems,
      firstSeenRef.current,
      Date.now(),
    );
    return withTriggerTimeouts(base, timedOut, t("trigger.statusTimeout"));
  }, [statusItems, triggerRowIds, timeoutTick, t]);

  const triggerSummaries = useMemo(() => {
    const bySlug = new Map(
      (catalog.data ?? []).map((tk) => [tk.slug, tk.name]),
    );
    return toTriggerSummaries(
      routines ?? [],
      (toolkit) => bySlug.get(toolkit) ?? toolkit,
      (app) => t("trigger.rowSummary", { app }),
      t("trigger.webhookRowSummary"),
    );
  }, [routines, catalog.data, t]);

  return {
    triggersEnabled,
    triggerStatuses,
    triggerSummaries,
    onReconnectTrigger,
  };
}
