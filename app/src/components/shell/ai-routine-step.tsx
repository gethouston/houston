import { useTranslation } from "react-i18next";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button, DialogTitle, Input, Switch, cn } from "@houston-ai/core";
import { ScheduleBuilder } from "@houston-ai/routines";
import type { SchedulePreset, RoutineFormData } from "@houston-ai/routines";

interface AiRoutineStepProps {
  routine: RoutineFormData;
  onRoutineChange: (next: RoutineFormData) => void;
  accepted: boolean;
  onAcceptedChange: (v: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
}

// No every_30min/hourly/custom: keep schedules cheap and understandable for
// the users
const PRESETS: SchedulePreset[] = ["daily", "weekdays", "weekly", "monthly"];

export function AiRoutineStep({
  routine,
  onRoutineChange,
  accepted,
  onAcceptedChange,
  onBack,
  onContinue,
}: AiRoutineStepProps) {
  const { t } = useTranslation("shell");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <button
        type="button"
        onClick={onBack}
        aria-label={t("common:actions.back")}
        className="absolute top-5 left-5 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <DialogTitle className="sr-only">{t("aiRoutine.stepTitle")}</DialogTitle>

      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 pt-14">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-base font-semibold">{t("aiRoutine.stepTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("aiRoutine.stepDescription")}</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">{t("aiRoutine.nameLabel")}</label>
            <Input
              value={routine.name}
              onChange={(e) => onRoutineChange({ ...routine, name: e.target.value })}
              className="rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">{t("aiRoutine.promptLabel")}</label>
            <textarea
              value={routine.prompt}
              onChange={(e) => onRoutineChange({ ...routine, prompt: e.target.value })}
              rows={3}
              className={cn(
                "w-full px-4 py-3 text-sm text-foreground leading-relaxed",
                "bg-secondary border border-black/[0.04] rounded-xl",
                "outline-none resize-none transition-shadow duration-200",
                "focus:shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
              )}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">{t("aiRoutine.scheduleLabel")}</label>
            <div className="rounded-xl bg-secondary p-4">
              <ScheduleBuilder
                value={routine.schedule}
                onChange={(schedule) => onRoutineChange({ ...routine, schedule })}
                presets={PRESETS}
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-medium text-foreground">{t("aiRoutine.consentTitle")}</p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              <li>{t("aiRoutine.consentScheduled")}</li>
              <li>{t("aiRoutine.consentUsage")}</li>
              <li>{t("aiRoutine.consentNeedsApp")}</li>
            </ul>
          </div>

          <p className="text-xs text-muted-foreground px-1">
            {t("aiRoutine.laterNote")}
          </p>

          <label className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3 cursor-pointer">
            <span className="text-sm font-medium text-foreground">{t("aiRoutine.enableLabel")}</span>
            <Switch checked={accepted} onCheckedChange={onAcceptedChange} />
          </label>

          <Button onClick={onContinue} className="mx-auto w-fit rounded-full">
            {t("aiRoutine.continueButton")}
          </Button>
        </div>
      </div>
    </div>
  );
}
