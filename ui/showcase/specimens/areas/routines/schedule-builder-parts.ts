import type { SpecimenProp } from "../../../src/specimen";

export const builderProps: readonly SpecimenProp[] = [
  {
    name: "value",
    type: "string",
    note: "Required. The cron expression the builder seeds its preset and fields from.",
  },
  {
    name: "onChange",
    type: "(cronExpression: string) => void",
    note: "Required. Fires on every field change with the newly derived cron.",
  },
  {
    name: "presets",
    type: "SchedulePreset[]",
    note: "Defaults to all six: every_30min, hourly, daily, weekly, monthly, custom.",
  },
  {
    name: "labels",
    type: "ScheduleLabels",
    note: "Every visible string, including the summary templates. Defaults to `DEFAULT_SCHEDULE_LABELS`.",
  },
  {
    name: "locale",
    type: "string",
    note: 'Defaults to `"en-US"`. Day names and clock format in the summary come from `Intl`.',
  },
  {
    name: "floor",
    type: "ScheduleFloor",
    note: 'A plan\'s minimum interval (`minutes`) and the rule that judges a cron against it (`allows`, bound by the app to the SDK; keep it memoized). The minutes stepper starts at the lowest count `allows` accepts (an uneven count saves as a true `@every` interval, so every count above it is accepted too), a typed count below it snaps up on blur, refused presets are hidden, `labels.minIntervalHint` names `minutes`, and a refused pick emits "". Absent = no limit.',
  },
];
