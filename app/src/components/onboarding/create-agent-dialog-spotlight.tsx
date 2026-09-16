import { useTranslation } from "react-i18next";
import { TutorialSpotlight, tutorialSelector } from "../tutorial";
import { useCreateAgentDialogAnchor } from "./use-create-agent-dialog-anchor";

/**
 * The in-app tutorial coaching INSIDE the real create-agent dialog (z-lifted,
 * no blockers — the dialog's own modality isolates the app). The ring follows
 * the user through the dialog's own screens: the guided brief the dialog opens
 * on, then the name and color.
 */
export function CreateAgentDialogSpotlight() {
  const { t } = useTranslation("setup");
  const anchor = useCreateAgentDialogAnchor(true);
  const copy = {
    createAgentBrief: {
      title: t("inApp.steps.createAgentDialog.briefTitle"),
      hint: t("inApp.steps.createAgentDialog.briefHint"),
    },
    createAgentNaming: {
      title: t("inApp.steps.createAgentDialog.nameTitle"),
      hint: t("inApp.steps.createAgentDialog.nameHint"),
    },
  }[anchor];

  return (
    <TutorialSpotlight
      inDialog
      selector={tutorialSelector(anchor)}
      title={copy.title}
      hint={copy.hint}
    />
  );
}
