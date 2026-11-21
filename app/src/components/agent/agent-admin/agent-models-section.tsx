import { useTranslation } from "react-i18next";
import type { CatalogModel } from "../../../lib/ai-hub/catalog-types.ts";
import { ModelsAllowlistEditor } from "../../ai-hub/models-allowlist-editor.tsx";

interface AgentModelsSectionProps {
  allowedModels: string[] | null;
  models: CatalogModel[];
  saving: boolean;
  onSave: (next: string[] | null) => void;
  labelledBy?: string;
  showIntro?: boolean;
}

export function AgentModelsSection({
  allowedModels,
  models,
  saving,
  onSave,
  labelledBy,
  showIntro,
}: AgentModelsSectionProps) {
  const { t } = useTranslation("teams");

  return (
    <ModelsAllowlistEditor
      models={models}
      allowedModels={allowedModels}
      saving={saving}
      onSave={onSave}
      labelledBy={labelledBy}
      showIntro={showIntro}
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
        clearSearch: t("agentAdmin.models.clearSearch"),
        noModels: t("agentAdmin.models.noModels"),
        allowModel: (name) => t("agentAdmin.models.allowModel", { name }),
      }}
    />
  );
}
