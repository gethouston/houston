import type { Routine } from "@houston-ai/engine-client";
import type {
  RenderTriggerEditor,
  TriggerLabels,
  TriggerStatusItem,
} from "@houston-ai/routines";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useIntegrationToolkits } from "../../hooks/queries/use-integrations";
import { useAgentTriggerStatus } from "../../hooks/queries/use-triggers";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import { RoutineTriggerEditor } from "./routine-trigger-editor";
import { toStatusMap, toTriggerSummaries } from "./routine-trigger-maps";

/**
 * Wires the Automations tab's event-trigger surface (C9): the capability gate,
 * the per-routine status badges, the humanized row summaries, the injected
 * editor body, and the reconnect hand-off to the Integrations surface. Returns
 * exactly the trigger-related props `RoutinesGrid` takes. Where the deployment
 * has no `capabilities.triggers`, everything is off: no fetches, no editor.
 */
export function useRoutineTriggers(
  agent: Agent,
  routines: Routine[] | undefined,
  triggerLabels: TriggerLabels,
): {
  triggersEnabled: boolean;
  triggerStatuses: Record<string, TriggerStatusItem>;
  triggerSummaries: Record<string, string>;
  renderTriggerEditor?: RenderTriggerEditor;
  onReconnectTrigger: () => void;
} {
  const { t } = useTranslation("routines");
  const { capabilities } = useCapabilities();
  const triggersEnabled = !!capabilities?.triggers;

  const statusQuery = useAgentTriggerStatus(agent.id, triggersEnabled);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, triggersEnabled);

  const setViewMode = useUIStore((s) => s.setViewMode);
  const onReconnectTrigger = useCallback(() => {
    // Same routing the Integrations tab's "Manage all" uses: the global
    // Integrations page, which everyone can reach.
    setViewMode(INTEGRATIONS_VIEW_ID);
  }, [setViewMode]);

  const triggerStatuses = useMemo(
    () => toStatusMap(statusQuery.data),
    [statusQuery.data],
  );

  const triggerSummaries = useMemo(() => {
    const bySlug = new Map(
      (catalog.data ?? []).map((tk) => [tk.slug, tk.name]),
    );
    return toTriggerSummaries(
      routines ?? [],
      (toolkit) => bySlug.get(toolkit) ?? toolkit,
      (app) => t("trigger.rowSummary", { app }),
    );
  }, [routines, catalog.data, t]);

  const renderTriggerEditor = useMemo<RenderTriggerEditor | undefined>(
    () =>
      triggersEnabled
        ? (props) => (
            <RoutineTriggerEditor
              agentId={agent.id}
              value={props.value}
              onChange={props.onChange}
              // Same navigation as the status badge's Reconnect: the place
              // where apps get connected.
              onConnectApp={onReconnectTrigger}
              labels={triggerLabels}
            />
          )
        : undefined,
    [triggersEnabled, agent.id, triggerLabels, onReconnectTrigger],
  );

  return {
    triggersEnabled,
    triggerStatuses,
    triggerSummaries,
    renderTriggerEditor,
    onReconnectTrigger,
  };
}
