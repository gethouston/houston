import type {
  Routine,
  TriggerStatusItem as WireTriggerStatusItem,
} from "@houston/engine-adapter";
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
import { withRemedyDetails } from "./trigger-remedy-detail";
import { useTriggerStatusTimeouts } from "./use-trigger-status-timeouts";

export interface TriggerSurface {
  triggersEnabled: boolean;
  triggerStatuses: Record<string, TriggerStatusItem>;
  triggerSummaries: Record<string, string>;
  onReconnectTrigger: () => void;
}

export function useTriggerStatusViewModel(
  routines: Routine[] | undefined,
  statusItems: WireTriggerStatusItem[] | null | undefined,
): TriggerSurface {
  const { t } = useTranslation("routines");
  const { capabilities } = useCapabilities();
  const triggersEnabled = !!capabilities?.triggers;

  const triggerRowIds = useMemo(
    () => triggerBoundRoutineIds(routines),
    [routines],
  );

  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, triggersEnabled);

  const setViewMode = useUIStore((s) => s.setViewMode);
  const onReconnectTrigger = useCallback(() => {
    setViewMode(INTEGRATIONS_VIEW_ID);
  }, [setViewMode]);

  const timedStatuses = useTriggerStatusTimeouts(triggerRowIds, statusItems);
  const triggerStatuses = useMemo(
    () => withRemedyDetails(timedStatuses, (key) => t(key)),
    [timedStatuses, t],
  );

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
