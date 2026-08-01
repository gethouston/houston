import { SelectItem } from "@houston-ai/core";

import type { SpecimenProp } from "../../../src/specimen";

const SCHEDULES = [
  { value: "every-15", label: "Every 15 minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily at 09:00" },
  { value: "weekly", label: "Mondays at 09:00" },
];

/** The list most of the page's triggers open onto. */
export function ScheduleItems() {
  return SCHEDULES.map((schedule) => (
    <SelectItem key={schedule.value} value={schedule.value}>
      {schedule.label}
    </SelectItem>
  ));
}

/** Twelve items: enough to make the content scroll and show its arrows. */
export function HourItems() {
  return Array.from({ length: 12 }, (_, hour) => {
    const at = `${String(hour * 2).padStart(2, "0")}:00`;
    return (
      <SelectItem key={at} value={at}>
        {at}
      </SelectItem>
    );
  });
}

/**
 * The select page's tables, split out so the page stays under the 200-line
 * rule. Read off `ui/core/src/components/select.tsx`. The parts wrap Radix,
 * so the behavioural props are Radix's and the styling props are ours.
 */
export const selectProps: readonly SpecimenProp[] = [
  {
    name: "Select.value / defaultValue",
    type: "string",
    note: "Controlled or uncontrolled, with `onValueChange` for both.",
  },
  {
    name: "Select.disabled",
    type: "boolean",
    note: "Takes the trigger out of the tab order.",
  },
  {
    name: "SelectTrigger.size",
    type: '"sm" | "default"',
    note: "Defaults to `default` (36px). `sm` is 32px.",
  },
  {
    name: "SelectValue.placeholder",
    type: "ReactNode",
    note: "Shown until a value exists; the trigger renders it in `ink-muted`.",
  },
  {
    name: "SelectContent.position",
    type: '"item-aligned" | "popper"',
    note: "Defaults to `item-aligned`, which opens the list over the trigger.",
  },
  {
    name: "SelectContent.align",
    type: '"start" | "center" | "end"',
    note: "Defaults to `center`.",
  },
  {
    name: "SelectItem.value",
    type: "string",
    note: "Required, and unique within the select.",
  },
  {
    name: "SelectItem.disabled",
    type: "boolean",
    note: "Half opacity, skipped by keyboard navigation.",
  },
  {
    name: "SelectLabel / SelectSeparator",
    type: "Radix `Label` / `Separator` props",
    note: "A group heading in `ink-muted`, and a hairline between groups.",
  },
];

export const selectTokens = [
  "border-line-input",
  "dark:bg-line-input/30",
  "bg-popover",
  "text-popover-text",
  "bg-hover",
  "text-hover-text",
  "text-ink-muted",
  "bg-line",
  "border-focus",
  "ring-focus",
  "border-danger",
  "ring-danger",
];
