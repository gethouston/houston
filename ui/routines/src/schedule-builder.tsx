import { cn } from "@houston-ai/core";
import { AnimatePresence } from "framer-motion";
import { DEFAULT_SCHEDULE_LABELS, interp, type ScheduleLabels } from "./labels";
import { presetAllowed, type ScheduleFloor } from "./schedule-floor";
import { IntervalPicker } from "./schedule-interval-picker";
import { DayOfMonthPicker, WeekdaysPicker } from "./schedule-picker-fields";
import { SchedulePresetButtons } from "./schedule-preset-buttons";
import { Reveal } from "./schedule-reveal";
import { TimePicker } from "./time-picker";
import type { SchedulePreset } from "./types";
import { useScheduleBuilder } from "./use-schedule-builder";

export interface ScheduleBuilderProps {
  value: string;
  onChange: (cronExpression: string) => void;
  presets?: SchedulePreset[];
  /** Localized labels. Defaults to English so standalone callers still work. */
  labels?: ScheduleLabels;
  /** BCP-47 locale for day names + time formatting in the live summary. */
  locale?: string;
  /** A plan's minimum interval and the rule that judges a cron against it.
   *  Keep it stable across renders (memoized). Absent = no limit. */
  floor?: ScheduleFloor;
}

const DEFAULT_PRESETS: SchedulePreset[] = [
  "every_30min",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "custom",
];

export function ScheduleBuilder({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  labels = DEFAULT_SCHEDULE_LABELS,
  locale = "en-US",
  floor,
}: ScheduleBuilderProps) {
  const {
    activePreset,
    selectPreset,
    options,
    updateOption,
    intervalEvery,
    setIntervalEvery,
    intervalUnit,
    setIntervalUnit,
    intervalMax,
    everyValid,
    floorOk,
    stepper,
    isCustom,
    showTime,
    summary,
  } = useScheduleBuilder(value, onChange, labels, locale, floor);

  const showCustomTime =
    isCustom && (intervalUnit === "days" || intervalUnit === "months");

  return (
    <div className="space-y-4">
      <SchedulePresetButtons
        presets={presets.filter((p) => presetAllowed(p, options, floor))}
        active={activePreset}
        labels={labels.presets}
        onSelect={selectPreset}
      />

      <p className="text-sm text-ink">{summary}</p>

      <div className="space-y-3">
        <AnimatePresence mode="popLayout" initial={false}>
          {showTime && (
            <Reveal key="preset-time">
              <TimePicker
                label={labels.timeLabel}
                value={options.time}
                onChange={(time) => updateOption({ time })}
                locale={locale}
                labels={labels.timePicker}
              />
            </Reveal>
          )}

          {activePreset === "weekly" && (
            <Reveal key="weekly-days">
              <WeekdaysPicker
                label={labels.weekdaysLabel}
                locale={locale}
                shortcuts={labels.weekdayShortcuts}
                value={options.daysOfWeek}
                onChange={(daysOfWeek) => updateOption({ daysOfWeek })}
              />
            </Reveal>
          )}

          {activePreset === "monthly" && (
            <Reveal key="monthly-dom">
              <DayOfMonthPicker
                label={labels.dayOfMonthLabel}
                value={options.dayOfMonth}
                onChange={(dayOfMonth) => updateOption({ dayOfMonth })}
              />
            </Reveal>
          )}

          {isCustom && (
            <Reveal key="custom-interval">
              <IntervalPicker
                label={labels.repeatEvery}
                units={labels.units}
                unitsSingular={labels.unitsSingular}
                decreaseLabel={labels.decrease}
                increaseLabel={labels.increase}
                every={intervalEvery}
                unit={intervalUnit}
                max={intervalMax}
                invalid={!everyValid}
                stepper={stepper}
                onEveryChange={setIntervalEvery}
                onUnitChange={setIntervalUnit}
              />
            </Reveal>
          )}

          {floor && isCustom && (intervalUnit === "minutes" || !floorOk) && (
            <Reveal key="custom-floor">
              <p
                className={cn(
                  "text-xs",
                  floorOk ? "text-ink-muted" : "text-warning-ink",
                )}
              >
                {interp(labels.minIntervalHint, { minutes: floor.minutes })}
              </p>
            </Reveal>
          )}

          {isCustom && intervalUnit === "months" && (
            <Reveal key="custom-dom">
              <DayOfMonthPicker
                label={labels.dayOfMonthLabel}
                value={options.dayOfMonth}
                onChange={(dayOfMonth) => updateOption({ dayOfMonth })}
              />
            </Reveal>
          )}

          {showCustomTime && (
            <Reveal key="custom-time">
              <TimePicker
                label={labels.timeLabel}
                value={options.time}
                onChange={(time) => updateOption({ time })}
                locale={locale}
                labels={labels.timePicker}
              />
            </Reveal>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
