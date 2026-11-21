import { FlowChoiceList, FlowChoiceRow, HoustonHelmet } from "@houston-ai/core";
import { FolderPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

export function AddChoiceStep({
  onAddAgent,
  onAddTeam,
}: {
  onAddAgent: () => void;
  onAddTeam: () => void;
}) {
  const { t } = useTranslation("shell");

  return (
    <FlowChoiceList>
      <FlowChoiceRow
        icon={<HoustonHelmet color="currentColor" />}
        title={t("addToWorkspace.agentTitle")}
        onClick={onAddAgent}
        dataAttrs={{ "data-create-choice": "agent" }}
      />
      <FlowChoiceRow
        icon={<FolderPlus />}
        title={t("addToWorkspace.teamTitle")}
        onClick={onAddTeam}
        dataAttrs={{ "data-create-choice": "team" }}
      />
    </FlowChoiceList>
  );
}
