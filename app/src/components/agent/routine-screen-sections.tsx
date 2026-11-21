import type { Routine, RoutineUpdate } from "@houston/engine-adapter";
import { Button, Textarea } from "@houston-ai/core";
import {
  cronSummary,
  describeNextFire,
  nextFire,
  RoutineRowScheduleEdit,
} from "@houston-ai/routines";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../hooks/use-routine-labels";
import { useRoutineScheduleFloor } from "../../hooks/use-routine-schedule-floor";
import type { Agent } from "../../lib/types";
import { RoutineModelRow } from "./routine-model-row";

interface Props {
  agent: Agent;
  routine: Routine;
  triggerSummary?: string;
  accountTimezone: string;
  onSave: (updates: RoutineUpdate) => void;
  saving: boolean;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function RoutineScreenSections({
  agent,
  routine,
  triggerSummary,
  accountTimezone,
  onSave,
  saving,
}: Props) {
  const { t } = useTranslation("routines");
  const { t: planT } = useTranslation("plan");
  const floor = useRoutineScheduleFloor();
  const [shortInterval, setShortInterval] = useState(false);
  const labels = useRoutineLabels();

  const [draft, setDraft] = useState(routine.prompt);
  const dirty = draft !== routine.prompt;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reseed only on the routine's own change
  useEffect(() => setDraft(routine.prompt), [routine.id, routine.prompt]);

  const next =
    !routine.trigger && routine.enabled && routine.schedule
      ? nextFire(routine.schedule, accountTimezone)
      : null;
  const nextRunText = next
    ? (() => {
        const d = describeNextFire(
          next,
          accountTimezone,
          new Date(),
          labels.nextFire,
          labels.locale,
        );
        return `${t("details.nextRun", { when: d.relative })} · ${d.absolute}`;
      })()
    : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <Section title={t("details.promptTitle")}>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          className="text-base"
          aria-label={t("details.promptTitle")}
        />
        {dirty && (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(routine.prompt)}
            >
              {t("row.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={saving || !draft.trim()}
              onClick={() => onSave({ prompt: draft })}
            >
              {t("row.save")}
            </Button>
          </div>
        )}
      </Section>

      <Section title={t("details.scheduleTitle")}>
        {routine.trigger ? (
          <p className="text-sm text-ink">
            {triggerSummary ?? labels.trigger.wakeEvent}
          </p>
        ) : (
          <div className="self-start">
            <RoutineRowScheduleEdit
              variant="field"
              routineId={routine.id}
              cron={routine.schedule ?? ""}
              summary={cronSummary(
                routine.schedule ?? "",
                labels.schedule.summary,
                labels.locale,
              )}
              scheduleFloor={floor}
              onScheduleChange={(_routineId, cron) => {
                const allowed = !floor || floor.allows(cron);
                setShortInterval(!allowed);
                if (allowed) onSave({ schedule: cron });
              }}
              labels={labels.rowLabels}
              scheduleLabels={labels.schedule}
              locale={labels.locale}
            />
            {shortInterval && floor && (
              <p className="text-xs text-warning-ink">
                {planT("shortInterval", { minutes: floor.minutes })}
              </p>
            )}
          </div>
        )}
        {nextRunText && (
          <p data-relative-time className="text-xs text-ink-muted">
            {nextRunText}
          </p>
        )}
      </Section>

      <Section title={t("details.modelTitle")}>
        <div className="self-start">
          <RoutineModelRow agent={agent} routine={routine} />
        </div>
      </Section>
    </div>
  );
}
