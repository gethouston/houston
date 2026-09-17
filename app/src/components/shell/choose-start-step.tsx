import { FlowChoiceList, FlowChoiceRow, HoustonHelmet } from "@houston-ai/core";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The two ways to get an AI employee. Hiring leads into the guided setup;
 * copying leads into the copy wizard, inside the same sheet.
 *
 * Two rows rather than a question with a quiet link beneath it. Copying is the
 * rarer errand, but it is a WHOLE other flow, and a user who already has the
 * agent they want a second of should meet that door as an equal, not find it
 * after scanning a hundred and eighty industries.
 *
 * The screen only exists when both doors do: with nothing to copy the sheet
 * opens on the industry question instead (`create-agent-steps-model.ts`).
 *
 * The question itself is the sheet's TITLE, not a headline here: the compact
 * frame reads as a confirm dialog, and the two doors sit directly under it.
 */
export function ChooseStartStep({
  onHire,
  onCopy,
}: {
  onHire: () => void;
  onCopy: () => void;
}) {
  const { t } = useTranslation("shell");

  return (
    <FlowChoiceList>
      <FlowChoiceRow
        icon={<HoustonHelmet color="currentColor" />}
        title={t("newAgent.hireTitle")}
        onClick={onHire}
      />
      <FlowChoiceRow
        icon={<Copy />}
        title={t("newAgent.copyTitle")}
        onClick={onCopy}
      />
    </FlowChoiceList>
  );
}
