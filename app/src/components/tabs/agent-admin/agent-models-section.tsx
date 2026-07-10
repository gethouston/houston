import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";
import { ModelsAllowlistEditor } from "../../ai-hub/models-allowlist-editor.tsx";
import { modelChecked } from "./model-allowlist.ts";

interface AgentModelsSectionProps {
  /** The agent-level model ceiling: `null` = all allowed, else the explicit set. */
  allowedModels: string[] | null;
  /** The org-wide model ceiling the agent set may only narrow (`null` = all). */
  orgAllowedModels: string[] | null;
  /** The AI-hub model directory (one entry per model, deduped across providers). */
  models: CatalogModel[];
  /** A write is in flight (disables the controls). */
  saving: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's AI-model ceiling (Teams v2),
 * rendered flush in the Access section's right pane (no card wrapper). A thin
 * wrapper over the shared {@link ModelsAllowlistEditor}: it narrows the selectable
 * universe to the org ceiling (a manager can only allow models the org itself
 * allows, mirroring the app allowlist's `orgAllowedToolkits` narrowing) and
 * supplies the `teams` i18n copy; all behavior lives in the editor. Each member
 * then picks their own model from the allowed set in the composer.
 */
export function AgentModelsSection({
  allowedModels,
  orgAllowedModels,
  models,
  saving,
  onSave,
}: AgentModelsSectionProps) {
  const { t } = useTranslation("teams");

  // The selectable universe: the org ceiling if one is set, else the whole
  // catalog. A model is offerable when any of its offers is within the org
  // ceiling — models the org disallows are never presented for the agent.
  const universe = useMemo(() => {
    if (orgAllowedModels === null) return models;
    const org = new Set(orgAllowedModels);
    return models.filter((m) => modelChecked(m, org));
  }, [models, orgAllowedModels]);

  return (
    <ModelsAllowlistEditor
      models={universe}
      allowedModels={allowedModels}
      saving={saving}
      onSave={onSave}
      copy={{
        question: t("agentAdmin.models.question"),
        policyHelper: t("agentAdmin.models.policyHelper"),
        anyLabel: t("agentAdmin.models.anyLabel"),
        anyDesc: t("agentAdmin.models.anyDesc"),
        pickedLabel: t("agentAdmin.models.pickedLabel"),
        pickedDesc: t("agentAdmin.models.pickedDesc"),
        allowedHeading: t("agentAdmin.models.allowedHeading"),
        addHeading: t("agentAdmin.models.addHeading"),
        allowedEmpty: t("agentAdmin.models.allowedEmpty"),
        allowedEmptyLab: t("agentAdmin.models.allowedEmptyLab"),
        searchModels: t("agentAdmin.models.searchModels"),
        noModels: t("agentAdmin.models.noModels"),
        allowModel: (name) => t("agentAdmin.models.allowModel", { name }),
      }}
    />
  );
}
