import { useEffect, useRef, useState } from "react";
import { DEFAULT_SCHEDULE_LABELS, type ScheduleLabels } from "./labels";
import {
  builderEmits,
  builderOutput,
  builderSummary,
} from "./schedule-builder-output";
import {
  cronToOptions,
  cronToPreset,
  type ScheduleOptions,
} from "./schedule-cron-utils";
import {
  countForUnitSwitch,
  defaultMinutesCount,
  type FloorStepper,
  floorStepper,
  type ScheduleFloor,
} from "./schedule-floor";
import {
  type IntervalUnit,
  intervalCountMax,
  scheduleToInterval,
} from "./schedule-interval-utils";
import type { SchedulePreset } from "./types";
import {
  useFloorMinuteMinimum,
  useLateFloorDefault,
  useOutsideScheduleSync,
} from "./use-schedule-builder-sync";

const DEFAULT_OPTIONS: ScheduleOptions = {
  time: "09:00",
  daysOfWeek: [1],
  dayOfMonth: 1,
};

const NEEDS_TIME: SchedulePreset[] = ["daily", "weekly", "monthly"];

export interface ScheduleBuilderState {
  activePreset: SchedulePreset;
  selectPreset: (preset: SchedulePreset) => void;
  options: ScheduleOptions;
  updateOption: (patch: Partial<ScheduleOptions>) => void;
  intervalEvery: string;
  setIntervalEvery: (every: string) => void;
  intervalUnit: IntervalUnit;
  setIntervalUnit: (unit: IntervalUnit) => void;
  intervalMax: number;
  everyValid: boolean;
  floorOk: boolean;
  stepper: FloorStepper | undefined;
  isCustom: boolean;
  showTime: boolean;
  summary: string;
}

export function useScheduleBuilder(
  value: string,
  onChange: (cronExpression: string) => void,
  labels: ScheduleLabels = DEFAULT_SCHEDULE_LABELS,
  locale = "en-US",
  floor?: ScheduleFloor,
): ScheduleBuilderState {
  const minimum = useFloorMinuteMinimum(floor);
  const detectedPreset = cronToPreset(value);
  const detectedInterval =
    detectedPreset === "custom" ? scheduleToInterval(value) : null;

  const [edits, setEdits] = useState(0);
  const touched = edits > 0;
  const edited = () => setEdits((n) => n + 1);

  const [activePreset, setActivePreset] = useState<SchedulePreset>(
    detectedPreset ?? "daily",
  );
  const [options, setOptions] = useState<ScheduleOptions>({
    ...DEFAULT_OPTIONS,
    ...cronToOptions(value),
  });
  const [intervalEvery, setEvery] = useState(
    detectedInterval
      ? String(detectedInterval.every)
      : String(defaultMinutesCount(minimum)),
  );
  const [intervalUnit, setUnit] = useState<IntervalUnit>(
    detectedInterval ? detectedInterval.unit : "minutes",
  );

  const countIsDefault = useRef(!detectedInterval);
  useLateFloorDefault(minimum, countIsDefault, setEvery);

  const pick = { activePreset, options, intervalEvery, intervalUnit, floor };
  const output = builderOutput(pick);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` gates only the very first emit (an empty seed) and `edits` is the re-emit trigger; re-running on `value` would echo every keystroke back
  useEffect(() => {
    if (!builderEmits(touched, value)) return;
    onChangeRef.current(output.schedule);
  }, [output.schedule, edits]);

  const selectPreset = (preset: SchedulePreset) => {
    if (preset === activePreset) return;
    setActivePreset(preset);
    edited();
  };
  const updateOption = (patch: Partial<ScheduleOptions>) => {
    const keys = Object.keys(patch) as (keyof ScheduleOptions)[];
    if (keys.every((k) => String(patch[k]) === String(options[k]))) return;
    setOptions((prev) => ({ ...prev, ...patch }));
    edited();
  };
  const setIntervalEvery = (every: string) => {
    if (every === intervalEvery) return;
    countIsDefault.current = false;
    setEvery(every);
    edited();
  };
  const setIntervalUnit = (unit: IntervalUnit) => {
    if (unit === intervalUnit) return;
    countIsDefault.current = false;
    setUnit(unit);
    edited();
    const kept = countForUnitSwitch(intervalEvery, unit, minimum);
    if (kept !== null) setEvery(kept);
  };
  const stepper = floorStepper(intervalEvery, intervalUnit, minimum, (n) =>
    setIntervalEvery(String(n)),
  );

  useOutsideScheduleSync(value, output.schedule, (outside) => {
    setActivePreset(outside.preset);
    setOptions({ ...DEFAULT_OPTIONS, ...outside.options });
    if (outside.interval) {
      countIsDefault.current = false;
      setEvery(String(outside.interval.every));
      setUnit(outside.interval.unit);
    }
  });

  return {
    activePreset,
    selectPreset,
    options,
    updateOption,
    intervalEvery,
    setIntervalEvery,
    intervalUnit,
    setIntervalUnit,
    intervalMax: intervalCountMax(intervalUnit),
    everyValid: output.everyValid,
    floorOk: output.floorOk,
    stepper,
    isCustom: activePreset === "custom",
    showTime: NEEDS_TIME.includes(activePreset),
    summary: builderSummary(pick, output, { touched, value }, labels, locale),
  };
}
