/**
 * State and effects for ScheduleBuilder, kept separate from the JSX so each
 * file stays small. What the state MEANS (the schedule it writes, validity, the
 * floor, the summary) is derived purely in `./schedule-builder-output`.
 */
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

const NEEDS_TIME: ReadonlySet<SchedulePreset> = new Set([
  "daily",
  "weekly",
  "monthly",
]);

export interface ScheduleBuilderState {
  activePreset: SchedulePreset;
  selectPreset: (preset: SchedulePreset) => void;
  options: ScheduleOptions;
  updateOption: (patch: Partial<ScheduleOptions>) => void;
  intervalEvery: string;
  setIntervalEvery: (every: string) => void;
  intervalUnit: IntervalUnit;
  setIntervalUnit: (unit: IntervalUnit) => void;
  /** The largest count the current unit takes. */
  intervalMax: number;
  everyValid: boolean;
  /** The floor's rule accepts the pick (true without one). */
  floorOk: boolean;
  /** Minutes-count stepping under the floor; undefined = step by one. */
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
  // Detect initial preset/interval from the incoming schedule.
  const detectedPreset = cronToPreset(value);
  const detectedInterval =
    detectedPreset === "custom" ? scheduleToInterval(value) : null;

  // Until the person changes something, the builder writes nothing back (see
  // builderEmits): opening the editor never rewrites a saved schedule, whether
  // the picker can't represent it (a weekday range) or would spell it anew (a
  // legacy `*\/16` the picker now writes as `@every 16m`).
  // Counts real edits: every one re-emits, even when the schedule string comes
  // out the same, so an edit always replaces an outside value it can't show.
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
  // The interval count is held as a string so the field can be cleared fully
  // while typing (e.g. to replace "1" with "984"); "" means no valid number.
  const [intervalEvery, setEvery] = useState(
    detectedInterval
      ? String(detectedInterval.every)
      : String(defaultMinutesCount(minimum)),
  );
  const [intervalUnit, setUnit] = useState<IntervalUnit>(
    detectedInterval ? detectedInterval.unit : "minutes",
  );

  // Still the builder's own default count until `value`, an edit or a unit
  // switch sets it: only then does a late floor move it.
  const countIsDefault = useRef(!detectedInterval);
  useLateFloorDefault(minimum, countIsDefault, setEvery);

  // A pick under the floor emits "" so the parent blocks saving it.
  const pick = { activePreset, options, intervalEvery, intervalUnit, floor };
  const output = builderOutput(pick);

  // Stable ref for onChange to avoid infinite effect loops.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Emit the schedule when the pick changes. An invalid pick emits "" so the
  // parent's save validation can block saving.
  /* oxlint-disable react-hooks/exhaustive-deps -- `value` gates only the very first emit (an empty seed) and `edits` is the re-emit trigger; re-running on `value` would echo every keystroke back */
  useEffect(() => {
    if (!builderEmits(touched, value)) return;
    onChangeRef.current(output.schedule);
  }, [output.schedule, edits]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // Setters mark the builder touched only on a real change, so re-clicking the
  // current preset or unit is not an edit and Save stays a no-op.
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
    showTime: NEEDS_TIME.has(activePreset),
    summary: builderSummary(pick, output, { touched, value }, labels, locale),
  };
}
