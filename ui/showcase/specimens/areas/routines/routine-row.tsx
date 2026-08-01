import { RoutineRow } from "@houston-ai/routines";
import { Mail } from "lucide-react";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { rowProps, rowTokens } from "./routine-row-parts";
import { Listbox, RowStates } from "./routine-row-states";
import {
  activeTrigger,
  inboxZero,
  meetingNotes,
  surfacedRun,
  TIMEZONE,
  TRIGGER_SUMMARY,
  weeklyReport,
} from "./sample";

/** The inline schedule editor, wired: Save writes the cron back into the row. */
function EditableRow() {
  const [schedule, setSchedule] = useState(inboxZero.schedule ?? "");
  return (
    <Listbox>
      <RoutineRow
        routine={{ ...inboxZero, schedule }}
        accountTimezone={TIMEZONE}
        onOpenChat={() => {}}
        onToggle={() => {}}
        onScheduleChange={(_id, cron) => setSchedule(cron)}
      />
    </Listbox>
  );
}

function RoutineRowSpecimen() {
  return (
    <SpecimenPage
      title="RoutineRow"
      intro="One routine in the list. Each routine IS a chat, so the whole row is the way into it — the switch, the kebab and the schedule pencil are the only things that are not."
    >
      <SpecimenSection
        title="Variants"
        note="No `variant` prop: the shape of the routine picks the row. A `schedule` gives the clock glyph and a plain-language cron line; a `trigger` gives the bell (or the app's own logo) and a live status chip beside the humanized event."
      >
        <SpecimenRow label="Schedule routine">
          <Listbox>
            <RoutineRow
              routine={inboxZero}
              accountTimezone={TIMEZONE}
              onOpenChat={() => {}}
              onToggle={() => {}}
              onRunNow={() => {}}
              onDelete={() => {}}
            />
          </Listbox>
        </SpecimenRow>
        <SpecimenRow label="Event routine">
          <Listbox>
            <RoutineRow
              routine={meetingNotes}
              lastRun={surfacedRun}
              accountTimezone={TIMEZONE}
              triggerStatus={activeTrigger}
              triggerSummary={TRIGGER_SUMMARY}
              onOpenChat={() => {}}
              onToggle={() => {}}
            />
          </Listbox>
        </SpecimenRow>
        <SpecimenRow label="Inline schedule editing (live)">
          <EditableRow />
        </SpecimenRow>
        <SpecimenRow label="App-supplied identity icon">
          <Listbox>
            <RoutineRow
              routine={inboxZero}
              accountTimezone={TIMEZONE}
              leadingIcon={() => (
                <Mail className="text-ink-muted" aria-hidden />
              )}
              onOpenChat={() => {}}
              onToggle={() => {}}
            />
          </Listbox>
        </SpecimenRow>
        <SpecimenRow label="Read-only (no handlers)">
          <Listbox>
            <RoutineRow routine={weeklyReport} accountTimezone={TIMEZONE} />
          </Listbox>
        </SpecimenRow>
      </SpecimenSection>

      <RowStates />

      <SpecimenProps items={rowProps} />
      <SpecimenTokens classes={rowTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["RoutineRow", "RoutineRowScheduleEdit"];

export const specimen: Specimen = {
  id: "routines-row",
  title: "RoutineRow",
  group: "Routines",
  render: () => <RoutineRowSpecimen />,
};
