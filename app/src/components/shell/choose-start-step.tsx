import { FlowChoiceList, FlowChoiceRow, HoustonHelmet } from "@houston-ai/core";
import { Copy } from "lucide-react";
import { useTranslation } from "react-i18next";

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
