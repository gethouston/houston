import { RoutineRow } from "@houston-ai/routines";
import type { ReactNode } from "react";

import { SpecimenRow, SpecimenSection } from "../../../src/specimen";
import {
  disconnectedTrigger,
  erroredRun,
  expenseFiler,
  inboxZero,
  meetingNotes,
  pausedRun,
  runningRun,
  TIMEZONE,
  TRIGGER_SUMMARY,
  weeklyReport,
} from "./sample";

/**
 * Rows are `role="option"` elements, so in the product they always sit inside
 * the list's single listbox. Every example on the page borrows that frame so a
 * screen reader reads a row here exactly as it reads one in the app.
 */
export function Listbox({ children }: { children: ReactNode }) {
  return (
    <div
      role="listbox"
      aria-label="Routines"
      className="w-full max-w-lg space-y-1.5"
    >
      {children}
    </div>
  );
}

/** The States block of the RoutineRow page — every run and trigger condition. */
export function RowStates() {
  return (
    <SpecimenSection
      title="States"
      note="Run state rides on top of the identity glyph as a ring, never replacing it: a soft pulsing ring while a run is in flight, a static danger ring when a schedule routine's last run failed. A run asleep on a plan-window usage limit drops the ring rather than pretending to work."
    >
      <SpecimenRow label="Selected">
        <Listbox>
          <RoutineRow
            routine={inboxZero}
            accountTimezone={TIMEZONE}
            selected
            onOpenChat={() => {}}
            onToggle={() => {}}
          />
        </Listbox>
      </SpecimenRow>
      <SpecimenRow label="Paused">
        <Listbox>
          <RoutineRow
            routine={expenseFiler}
            accountTimezone={TIMEZONE}
            onOpenChat={() => {}}
            onToggle={() => {}}
          />
        </Listbox>
      </SpecimenRow>
      <SpecimenRow label="Running — the kebab offers Stop">
        <Listbox>
          <RoutineRow
            routine={inboxZero}
            lastRun={runningRun}
            accountTimezone={TIMEZONE}
            onOpenChat={() => {}}
            onToggle={() => {}}
            onRunNow={() => {}}
            onStopRun={() => {}}
          />
        </Listbox>
      </SpecimenRow>
      <SpecimenRow label="Sleeping on a usage limit">
        <Listbox>
          <RoutineRow
            routine={inboxZero}
            lastRun={pausedRun}
            accountTimezone={TIMEZONE}
            onOpenChat={() => {}}
            onToggle={() => {}}
          />
        </Listbox>
      </SpecimenRow>
      <SpecimenRow label="Last run errored">
        <Listbox>
          <RoutineRow
            routine={weeklyReport}
            lastRun={erroredRun}
            accountTimezone={TIMEZONE}
            onOpenChat={() => {}}
            onToggle={() => {}}
          />
        </Listbox>
      </SpecimenRow>
      <SpecimenRow label="Trigger needs reconnecting">
        <Listbox>
          <RoutineRow
            routine={meetingNotes}
            accountTimezone={TIMEZONE}
            triggerStatus={disconnectedTrigger}
            triggerSummary={TRIGGER_SUMMARY}
            onReconnectTrigger={() => {}}
            onOpenChat={() => {}}
            onToggle={() => {}}
          />
        </Listbox>
      </SpecimenRow>
      <SpecimenRow label="Trigger status still unknown">
        <Listbox>
          <RoutineRow
            routine={meetingNotes}
            accountTimezone={TIMEZONE}
            onOpenChat={() => {}}
            onToggle={() => {}}
          />
        </Listbox>
      </SpecimenRow>
    </SpecimenSection>
  );
}
