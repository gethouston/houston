import type { StepChrome } from "@houston-ai/chat";
import { InteractionModal, InteractionModalTitle } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { cronSummary } from "@houston-ai/routines";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";
import { availableTemplates, resolveTemplateWake } from "./templates";
import type { IntakeResult } from "./types";

interface IntakeTemplateCardProps {
  accountTimezone: string;
  triggersAvailable: boolean;
  chrome: StepChrome;
  onBack: () => void;
  onComplete: (result: IntakeResult) => void;
}

export function IntakeTemplateCard({
  accountTimezone,
  triggersAvailable,
  chrome,
  onBack,
  onComplete,
}: IntakeTemplateCardProps): ReactNode {
  const { t } = useTranslation("routines");
  const routineLabels = useRoutineLabels();
  const templates = availableTemplates(triggersAvailable);

  const pick = (id: string) => {
    const template = templates.find((tpl) => tpl.id === id);
    if (!template) return;
    const wake = resolveTemplateWake(template, accountTimezone, (cron) =>
      cronSummary(cron, routineLabels.schedule.summary, routineLabels.locale),
    );
    onComplete({
      intent: t(`intake.templates.${id}.intent`),
      wake,
      scheduleHint: null,
      templateId: id,
    });
  };

  return (
    <InteractionModal
      contentKey="template"
      collapseLabel={chrome.collapseLabel}
      disabled={chrome.disabled}
      dismissLabel={chrome.dismissLabel}
      expandLabel={chrome.expandLabel}
      onDismiss={chrome.onDismiss}
      onOpenChange={chrome.onOpenChange}
      open={chrome.open}
      pager={chrome.pager}
      title={
        <InteractionModalTitle className="text-balance">
          {t("intake.templatePickTitle")}
        </InteractionModalTitle>
      }
      body={
        <div className="flex flex-col gap-1">
          {templates.map((template) => (
            <button
              className="flex flex-col gap-0.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-focus/50 disabled:pointer-events-none disabled:opacity-50"
              disabled={chrome.disabled}
              key={template.id}
              onClick={() => pick(template.id)}
              type="button"
            >
              <span className="text-ink text-sm">
                {t(`intake.templates.${template.id}.name`)}
              </span>
              <span className="text-ink-muted text-xs leading-snug">
                {t(`intake.templates.${template.id}.description`)}
              </span>
            </button>
          ))}
        </div>
      }
      footer={
        <Button
          className="gap-1.5 text-ink-muted"
          disabled={chrome.disabled}
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowLeft className="size-3.5" />
          {t("common:actions.back")}
        </Button>
      }
    />
  );
}
