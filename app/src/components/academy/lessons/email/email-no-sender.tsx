import { Button } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../../../hooks/use-can-create-agents";
import { useUIStore } from "../../../../stores/ui";
import { LessonPanelFrame } from "../lesson-panel-frame";

/**
 * A team with nobody on it cannot send anything, so the beat says so and
 * offers the real hiring flow, stacked over the lesson. The beat updates the
 * moment the new AI Employee joins, and the lesson carries on from there. A
 * member who may not hire is told who can.
 */
export function EmailNoSender() {
  const { t } = useTranslation("academy");
  const { canCreate } = useCanCreateAgents();

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
