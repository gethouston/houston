import { Button, TooltipProvider } from "@houston-ai/core";
import type { Routine, RoutineRun } from "@houston-ai/routines";
import { RoutinesGrid } from "@houston-ai/routines";
import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { gridProps, gridTokens } from "./routines-grid-parts";
import {
  activeTrigger,
  erroredRun,
  routines as fixtures,
  meetingNotes,
  TIMEZONE,
  TRIGGER_SUMMARY,
  weeklyReport,
} from "./sample";

/** The list is a `flex-1` pane, so every example gets a bounded column to fill. */
function Pane({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-96 w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-card/40">
      {children}
    </div>
  );
}

const createButton = (
  <Button>
    <Plus className="size-4" />
    New routine
  </Button>
);

/** The pane as it ships: selection, the switch, the kebab and inline editing. */
function LiveGrid() {
  const [list, setList] = useState<Routine[]>(fixtures);
  const [runs, setRuns] = useState<Record<string, RoutineRun>>({
    [weeklyReport.id]: erroredRun,
  });
  const [selected, setSelected] = useState<string | null>(meetingNotes.id);

  const patch = (id: string, changes: Partial<Routine>) =>
    setList((all) =>
      all.map((one) => (one.id === id ? { ...one, ...changes } : one)),
    );

  return (
    <Pane>
      <RoutinesGrid
        routines={list}
        lastRuns={runs}
        accountTimezone={TIMEZONE}
        selectedRoutineId={selected}
        onOpenChat={setSelected}
        onToggle={(id, enabled) => patch(id, { enabled })}
        onScheduleChange={(id, schedule) => patch(id, { schedule })}
        onDeleteRoutine={(id) =>
          setList((all) => all.filter((one) => one.id !== id))
        }
        onRunNow={(id) =>
          setRuns((all) => ({
            ...all,
            [id]: {
              id: `run-${id}`,
              routine_id: id,
              status: "running",
              session_key: `routine:${id}`,
              started_at: new Date().toISOString(),
            },
          }))
        }
        onStopRun={(id) =>
          setRuns((all) => {
            const { [id]: _stopped, ...rest } = all;
            return rest;
          })
        }
        triggerStatuses={{ [meetingNotes.id]: activeTrigger }}
        triggerSummaries={{ [meetingNotes.id]: TRIGGER_SUMMARY }}
      />
    </Pane>
  );
}

function RoutinesGridSpecimen() {
  return (
    <SpecimenPage
      title="RoutinesGrid"
      intro="The Routines pane: one selectable list of everything an agent does on its own, whether it wakes on a clock or on an event."
    >
      <SpecimenSection
        title="Variants"
        note="There is no `variant` prop. The list has one shape and three gates: loading, empty, populated. Populated delegates to `RoutinesGridList`, empty to `RoutinesGridEmpty`."
      >
        <SpecimenRow label="Populated (live)">
          <LiveGrid />
        </SpecimenRow>
        <SpecimenRow label="Read-only">
          <Pane>
            <RoutinesGrid
              routines={fixtures}
              accountTimezone={TIMEZONE}
              triggerStatuses={{ [meetingNotes.id]: activeTrigger }}
              triggerSummaries={{ [meetingNotes.id]: TRIGGER_SUMMARY }}
            />
          </Pane>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="`loading` only wins while there is genuinely nothing to show, so a refresh never blanks a list the reader is already looking at. Drafts sort above every created routine; paused routines sort last and dim."
      >
        <SpecimenRow label="Loading">
          <Pane>
            <RoutinesGrid routines={[]} accountTimezone={TIMEZONE} loading />
          </Pane>
        </SpecimenRow>
        <SpecimenRow label="Empty, with the create action">
          <Pane>
            <RoutinesGrid
              routines={[]}
              accountTimezone={TIMEZONE}
              emptyAction={createButton}
            />
          </Pane>
        </SpecimenRow>
        <SpecimenRow label="Two setup chats still open">
          <TooltipProvider>
            <Pane>
              <RoutinesGrid
                routines={fixtures.slice(0, 2)}
                draftActivities={[{ id: "draft-1" }, { id: "draft-2" }]}
                selectedDraftId="draft-1"
                accountTimezone={TIMEZONE}
                onResumeDraft={() => {}}
                onDiscardDraft={() => {}}
                triggerStatuses={{ [meetingNotes.id]: activeTrigger }}
                triggerSummaries={{ [meetingNotes.id]: TRIGGER_SUMMARY }}
              />
            </Pane>
          </TooltipProvider>
        </SpecimenRow>
        <SpecimenRow label="Loading, over a list that already has rows">
          <Pane>
            <RoutinesGrid
              routines={fixtures.slice(0, 2)}
              accountTimezone={TIMEZONE}
              loading
              triggerStatuses={{ [meetingNotes.id]: activeTrigger }}
            />
          </Pane>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={gridProps} />
      <SpecimenTokens classes={gridTokens} />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["RoutinesGrid", "RoutinesGridList"];

export const specimen: Specimen = {
  id: "routines-grid",
  title: "RoutinesGrid",
  group: "Routines",
  render: () => <RoutinesGridSpecimen />,
};
