import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@houston-ai/core";

import {
  type Specimen,
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import {
  HourItems,
  ScheduleItems,
  selectProps,
  selectTokens,
} from "./select-parts";

const AGENTS = [
  { value: "inbox-zero", label: "Inbox Zero" },
  { value: "meeting-notes", label: "Meeting Notes" },
  { value: "weekly-report", label: "Weekly Report" },
];

function SelectSpecimen() {
  return (
    <SpecimenPage
      title="Select"
      intro="The one-of-many field: a bordered trigger, a solid popover, a check on the chosen row. Open one: it is live."
    >
      <SpecimenSection
        title="Variants"
        note="Two knobs, on two parts. The trigger takes a `size`; the content takes a `position`. `item-aligned` puts the chosen row over the trigger, `popper` hangs the list below it."
      >
        <SpecimenRow label="position: item-aligned">
          <Select defaultValue="hourly">
            <SelectTrigger className="w-56" aria-label="Schedule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <ScheduleItems />
            </SelectContent>
          </Select>
        </SpecimenRow>
        <SpecimenRow label="position: popper">
          <Select defaultValue="hourly">
            <SelectTrigger className="w-56" aria-label="Schedule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <ScheduleItems />
            </SelectContent>
          </Select>
        </SpecimenRow>
        <SpecimenRow label="Grouped, with a separator">
          <Select defaultValue="inbox-zero">
            <SelectTrigger className="w-56" aria-label="Run as">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Your agents</SelectLabel>
                {AGENTS.map((agent) => (
                  <SelectItem key={agent.value} value={agent.value}>
                    {agent.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>From the store</SelectLabel>
                <SelectItem value="expense-filer">Expense Filer</SelectItem>
                <SelectItem value="standup-buddy">Standup Buddy</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </SpecimenRow>
        <SpecimenRow label="Scrolling list">
          <Select defaultValue="08:00">
            <SelectTrigger className="w-56" aria-label="Start at">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <HourItems />
            </SelectContent>
          </Select>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="A placeholder trigger reads in `ink-muted`; a chosen one reads in `ink`. The check mark is the only selection affordance; no highlight fill is left behind."
      >
        <SpecimenRow label="Placeholder">
          <Select>
            <SelectTrigger className="w-56" aria-label="Schedule">
              <SelectValue placeholder="Pick a schedule" />
            </SelectTrigger>
            <SelectContent>
              <ScheduleItems />
            </SelectContent>
          </Select>
        </SpecimenRow>
        <SpecimenRow label="Selected">
          <Select defaultValue="daily">
            <SelectTrigger className="w-56" aria-label="Schedule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <ScheduleItems />
            </SelectContent>
          </Select>
        </SpecimenRow>
        <SpecimenRow label="Disabled trigger">
          <Select disabled defaultValue="daily">
            <SelectTrigger className="w-56" aria-label="Schedule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <ScheduleItems />
            </SelectContent>
          </Select>
        </SpecimenRow>
        <SpecimenRow label="Disabled item">
          <Select defaultValue="every-15">
            <SelectTrigger className="w-56" aria-label="Schedule">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <ScheduleItems />
              <SelectItem value="realtime" disabled>
                Continuously (Pro plan)
              </SelectItem>
            </SelectContent>
          </Select>
        </SpecimenRow>
        <SpecimenRow label="Invalid">
          <Select>
            <SelectTrigger className="w-56" aria-invalid aria-label="Schedule">
              <SelectValue placeholder="Pick a schedule" />
            </SelectTrigger>
            <SelectContent>
              <ScheduleItems />
            </SelectContent>
          </Select>
          <span className="text-danger text-sm">
            Choose when Inbox Zero should run.
          </span>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="On the trigger only: `default` matches an Input at 36px, `sm` drops to 32px for a toolbar."
      >
        {(["default", "sm"] as const).map((size) => (
          <SpecimenRow key={size} label={size}>
            <Select defaultValue="hourly">
              <SelectTrigger size={size} className="w-56" aria-label="Schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <ScheduleItems />
              </SelectContent>
            </Select>
          </SpecimenRow>
        ))}
      </SpecimenSection>

      <SpecimenProps items={selectProps} />
      <SpecimenTokens classes={selectTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = [
  "Select",
  "SelectContent",
  "SelectGroup",
  "SelectItem",
  "SelectLabel",
  "SelectSeparator",
  "SelectTrigger",
  "SelectValue",
];

export const specimen: Specimen = {
  id: "core-select",
  title: "Select",
  group: "Actions & inputs",
  render: () => <SelectSpecimen />,
};
