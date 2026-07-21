import type { Routine } from "@houston-ai/engine-client";
import type { TriggerStatusItem } from "@houston-ai/routines";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationToolkits } from "../../hooks/queries/use-integrations";
import { useAgentTriggerStatus } from "../../hooks/queries/use-triggers";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import {
  TRIGGER_STATUS_TIMEOUT_MS,
  timedOutTriggerIds,
  toStatusMap,
  toTriggerSummaries,
  withTriggerTimeouts,
} from "./routine-trigger-maps";

/**
 * Wires the Automations tab's event-trigger surface (C9): the capability gate,
 * the per-routine status badges, the humanized row summaries, and the reconnect
 * hand-off to the Integrations surface. Returns exactly the trigger-related
 * props `RoutinesGrid` takes (the pick-an-app editor now lives in the creation
 * stepper's trigger step, not the grid).
 *
 * `triggersEnabled` (from `capabilities.triggers`) gates ONLY offering NEW event
 * triggers — the wizard's event option and the app catalog. Trigger STATUS runs
 * whenever the agent already has at least one trigger-bound routine, regardless
 * of the capability: a routine that can never fire here must still show its
 * health (an older host 404s -> the rows fall back to the unknown state). No
 * trigger routines -> no status fetch.
 */
export function useRoutineTriggers(
  agent: Agent,
  routines: Routine[] | undefined,
): {
  triggersEnabled: boolean;
  triggerStatuses: Record<string, TriggerStatusItem>;
  triggerSummaries: Record<string, string>;
  onReconnectTrigger: () => void;
} {
  const { t } = useTranslation("routines");
  const { capabilities } = useCapabilities();
  const triggersEnabled = !!capabilities?.triggers;

  // Status runs off the routines themselves, not the capability: a bound
  // routine's health must show even where it can never fire.
  const triggerRoutineIds = useMemo(
    () => (routines ?? []).filter((r) => r.trigger).map((r) => r.id),
    [routines],
  );

  const statusQuery = useAgentTriggerStatus(
    agent.id,
    triggerRoutineIds.length > 0,
    triggerRoutineIds,
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
  const statusItems = statusQuery.data;
  const firstSeenRef = useRef<Record<string, number>>({});
  const [timeoutTick, setTimeoutTick] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const ids = new Set(triggerRoutineIds);
    const known = new Set((statusItems ?? []).map((i) => i.routine_id));
    const seen = firstSeenRef.current;
    for (const id of triggerRoutineIds) {
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
  }, [triggerRoutineIds, statusItems]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: timeoutTick is a deliberate recompute trigger — the body reads firstSeenRef.current + Date.now() live, and the timer bumps timeoutTick so an elapsed timeout flips the routine to the error copy.
  const triggerStatuses = useMemo(() => {
    const base = toStatusMap(statusItems);
    const timedOut = timedOutTriggerIds(
      triggerRoutineIds,
      statusItems,
      firstSeenRef.current,
      Date.now(),
    );
    return withTriggerTimeouts(base, timedOut, t("trigger.statusTimeout"));
  }, [statusItems, triggerRoutineIds, timeoutTick, t]);

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
