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
import { canSeeIntegrationsPage } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { INTEGRATION_PROVIDER } from "../integrations/model";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id";
import { RoutineTriggerEditor } from "./routine-trigger-editor";
import { toStatusMap, toTriggerSummaries } from "./routine-trigger-maps";

/**
 * Wires the Reactions tab's event-trigger surface (C9): the capability gate, the
 * per-routine status badges, the humanized row summaries, the injected editor
 * body, and the reconnect hand-off to the Integrations surface. Returns exactly
 * the trigger-related props `RoutinesGrid` takes.
 *
 * `enabled` lets a schedule-only caller (the Routines tab) turn the whole
 * surface off so it never fetches trigger status or catalogs; it is ANDed with
 * the deployment's `capabilities.triggers`.
 */
export function useRoutineTriggers(
  agent: Agent,
  routines: Routine[] | undefined,
  triggerLabels: TriggerLabels,
  enabled = true,
): {
  triggersEnabled: boolean;
  triggerStatuses: Record<string, TriggerStatusItem>;
  triggerSummaries: Record<string, string>;
  renderTriggerEditor?: RenderTriggerEditor;
  onReconnectTrigger: () => void;
} {
  const { t } = useTranslation("routines");
  const { capabilities } = useCapabilities();
  const triggersEnabled = enabled && !!capabilities?.triggers;

  const statusQuery = useAgentTriggerStatus(agent.id, triggersEnabled);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, triggersEnabled);

  const setViewMode = useUIStore((s) => s.setViewMode);
  const setSettingsSection = useUIStore((s) => s.setSettingsSection);
  const onReconnectTrigger = useCallback(() => {
    // Same routing the Integrations tab's "Manage all" uses: the policy page
    // when the caller can see it, else Settings > Connected accounts.
    if (canSeeIntegrationsPage(capabilities)) setViewMode(INTEGRATIONS_VIEW_ID);
    else {
      setSettingsSection("connectedAccounts");
      setViewMode("settings");
    }
  }, [capabilities, setViewMode, setSettingsSection]);

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
              labels={triggerLabels}
            />
          )
        : undefined,
    [triggersEnabled, agent.id, triggerLabels],
  );

  return {
    triggersEnabled,
    triggerStatuses,
    triggerSummaries,
    renderTriggerEditor,
    onReconnectTrigger,
  };
}
