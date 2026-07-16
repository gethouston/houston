import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";
import { ModelsAllowlistEditor } from "../../ai-hub/models-allowlist-editor.tsx";

interface AgentModelsSectionProps {
  /** The agent-level model ceiling: `null` = all allowed, else the explicit set. */
  allowedModels: string[] | null;
  /** The AI-hub model directory (one entry per model, deduped across providers). */
  models: CatalogModel[];
  /** A write is in flight (disables the controls). */
  saving: boolean;
  /** View-only viewer (a non-manager): controls disabled, "Add models" hidden. */
  readOnly?: boolean;
  /** Persist the next ceiling: `null` = allow all, else the explicit set. */
  onSave: (next: string[] | null) => void;
}

/**
 * Agent-manager-only editor for this agent's AI-model ceiling (Teams v2),
 * rendered flush in the Access section's right pane (no card wrapper). A thin
 * wrapper over the shared {@link ModelsAllowlistEditor}: the whole catalog is the
 * selectable universe (policy is per agent only — there is no org-wide ceiling to
 * narrow it) and it supplies the `teams` i18n copy; all behavior lives in the
 * editor. Each member then picks their own model from the allowed set in the
 * composer.
 */
export function AgentModelsSection({
  allowedModels,
  models,
  saving,
  readOnly = false,
  onSave,
}: AgentModelsSectionProps) {
  const { t } = useTranslation("teams");

  return (
    <ModelsAllowlistEditor
      models={models}
      allowedModels={allowedModels}
      saving={saving}
      readOnly={readOnly}
      onSave={onSave}
      copy={{
        question: t("agentAdmin.models.question"),
        policyHelper: t("agentAdmin.models.policyHelper"),
        readOnlyNote: t("agentAdmin.models.readOnlyNote"),
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
