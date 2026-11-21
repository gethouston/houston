import type { IntegrationToolkit } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import { AllowlistEditor } from "../../integrations/allowlist-editor";

interface AgentAllowlistSectionProps {
  allowedToolkits: string[] | null;
  catalog: IntegrationToolkit[];
  connectedToolkits: string[];
  saving: boolean;
  onSave: (next: string[] | null) => void;
  labelledBy?: string;
  showIntro?: boolean;
}

export function AgentAllowlistSection({
  allowedToolkits,
  catalog,
  connectedToolkits,
  saving,
  onSave,
  labelledBy,
  showIntro,
}: AgentAllowlistSectionProps) {
  const { t } = useTranslation("teams");

  return (
    <AllowlistEditor
      universe={catalog}
      allowedToolkits={allowedToolkits}
      seedToolkits={connectedToolkits}
      saving={saving}
      onSave={onSave}
      labelledBy={labelledBy}
      showIntro={showIntro}
      copy={{
        question: t("integrations.allowlist.question"),
        policyHelper: t("integrations.allowlist.policyHelper"),
        anyLabel: t("integrations.allowlist.anyLabel"),
        anyDesc: t("integrations.allowlist.anyDesc"),
        pickedLabel: t("integrations.allowlist.pickedLabel"),
        pickedDesc: t("integrations.allowlist.pickedDesc"),
        allowedHeading: t("integrations.allowlist.allowedHeading"),
        addHeading: t("integrations.allowlist.addHeading"),
        allowedEmpty: t("integrations.allowlist.allowedEmpty"),
        allowedEmptyCategory: t("integrations.allowlist.allowedEmptyCategory"),
        allowApp: (name) => t("integrations.allowlist.allowApp", { name }),
      }}
    />
  );
}
