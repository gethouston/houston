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
  /** Timezone applied to a schedule template's resolved pick. */
  accountTimezone: string;
  /** Whether event triggers exist (offers the app-event template). */
  triggersAvailable: boolean;
  /** The stepper chrome (pager + dismiss X) so this card renders the SAME shell
   *  as a real ask_user card. */
  chrome: StepChrome;
  /** Back to the fork question. */
  onBack: () => void;
  /** Picking a template resolves its intent + wake and completes the intake. */
  onComplete: (result: IntakeResult) => void;
}

/**
 * The template picker card: clean rows of example routines (a name over a
 * one-line description), each a keyboard-friendly button. Picking one resolves
 * its wake with the same `cronSummary` util the schedule card uses (so the AI
 * restates the schedule in plain words) and completes the intake immediately
 * with `{ intent, wake, scheduleHint: null, templateId }` (templates resolve a
 * concrete schedule, so they carry no free-text hint) — the AI then confirms
 * and tailors it.
 */
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
      disabled={chrome.disabled}
      dismissLabel={chrome.dismissLabel}
      onDismiss={chrome.onDismiss}
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
