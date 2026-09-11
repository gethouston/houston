import type { Routine } from "@houston-ai/engine-client";
import type { TriggerStatusItem } from "@houston-ai/routines";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationToolkits } from "../../hooks/queries/use-integrations";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useUIStore } from "../../stores/ui";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import {
  toTriggerSummaries,
  triggerBoundRoutineIds,
} from "./routine-trigger-maps";
import { useTriggerStatusTimeouts } from "./use-trigger-status-timeouts";

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
 * The FETCH stays with the caller and everything downstream of it lives here:
 * a team's cross-agent list (`team-routines/use-team-trigger-statuses.ts`) fans
 * status out per agent and hands it over. The timeout rule itself lives in
 * `useTriggerStatusTimeouts`, shared with the routine screen's activation chip:
 * it is the only reason a trigger row cannot lie, so there is exactly one copy.
 *
 * The contract, and the reason this works for a merged list: `routines[i].id`
 * and `statusItems[j].routine_id` are both the GRID's row id. The team list
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
    // A broken trigger is repaired at the CONNECTION, so this routes to the
    // global Integrations page, which everyone can reach.
    setViewMode(INTEGRATIONS_VIEW_ID);
  }, [setViewMode]);

  const triggerStatuses = useTriggerStatusTimeouts(triggerRowIds, statusItems);

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
