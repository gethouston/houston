import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useCanAddAgentsHere } from "../../../../hooks/use-can-create-agents";
import { useUIStore } from "../../../../stores/ui";
import { LessonPanelFrame } from "../lesson-panel-frame";

export function EmailNoSender() {
  const { t } = useTranslation("academy");
  const canCreate = useCanAddAgentsHere();

  return (
    <LessonPanelFrame
      title={t("lessons.employee-email.steps.sender.empty.title")}
      body={
        canCreate
          ? t("lessons.employee-email.steps.sender.empty.body")
          : t("lessons.employee-email.steps.sender.empty.askAdmin")
      }
    >
      {canCreate && (
        <Button
          autoFocus
          className="self-end rounded-full active:scale-[0.96]"
          onClick={() => useUIStore.getState().openCreateFlow("agent")}
        >
          {t("lessons.employee-email.steps.sender.empty.cta")}
        </Button>
      )}
    </LessonPanelFrame>
  );
}
