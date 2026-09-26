import { FlowChoiceList, FlowChoiceRow, HoustonHelmet } from "@houston-ai/core";
import { FolderPlus } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The sheet's first screen: everything a user may ADD to their workspace, as
 * two rows. An AI employee is a Houston, so its row wears the product's own
 * mark rather than a generic robot; a group wears a folder with a plus.
 *
 * The screen exists only when BOTH answers do — a caller who may create only
 * one of them opens on that one's own first step instead, because a question
 * with a single answer is a click spent on nothing
 * (`create-agent-steps-model.ts`).
 *
 * The question itself is the sheet's TITLE, not a headline here: the compact
 * frame reads as a confirm dialog, and the answers sit directly under the
 * thing being asked with nothing between them.
 */
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
