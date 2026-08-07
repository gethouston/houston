import { RoutineDetails, type RoutineRun } from "@houston-ai/routines";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenRow,
  SpecimenSection,
} from "../../../src/specimen";
import { erroredRun, inboxZero, runningRun, surfacedRun } from "./sample";

/** One routine's full week — every outcome the run list can show, newest first. */
const history: RoutineRun[] = [
  { ...runningRun, id: "run-d0" },
  { ...surfacedRun, id: "run-d1", routine_id: inboxZero.id },
  {
    id: "run-d2",
    routine_id: inboxZero.id,
    status: "silent",
    session_key: "routine:inbox-zero",
    started_at: "2026-07-27T12:00:00.000Z",
    completed_at: "2026-07-27T12:00:41.000Z",
  },
  { ...erroredRun, id: "run-d3", routine_id: inboxZero.id },
  {
    id: "run-d4",
    routine_id: inboxZero.id,
    status: "cancelled",
    session_key: "routine:inbox-zero",
    started_at: "2026-07-23T12:00:00.000Z",
    completed_at: "2026-07-23T12:04:09.000Z",
  },
];

const noop = () => {};

/** Stand-in for the app-injected model row (the pin selector is app/-side). */
const modelSlot = <span className="text-sm text-ink-muted">Agent's model</span>;

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="w-[28rem] max-w-full">{children}</div>;
}

function RoutineDetailsSpecimen() {
  return (
    <SpecimenPage
      title="RoutineDetails"
      intro="The body of a routine's own screen (PRODUCT-1208): the instruction verbatim — the prompt IS what the routine does — its wake summary, the model it runs on, and its execution history. Clicking a run opens that run's chat (its result); the app wires the handler."
    >
      <SpecimenSection
        title="States"
        note="Every outcome the run list can show: running (spinner), done (surfaced), nothing to report (silent), failed, stopped. Failed and done rows carry the summary the run left behind; rows are buttons when a run-open handler is wired."
      >
        <SpecimenRow label="full history (clickable runs)">
          <Frame>
            <RoutineDetails
              prompt={inboxZero.prompt}
              scheduleSummary="Runs every weekday at 8:00 AM"
              nextRunText="Next run in 2h · Tue at 8:00 AM"
              modelSlot={modelSlot}
              runs={history}
              onOpenRun={noop}
            />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="no runs yet">
          <Frame>
            <RoutineDetails
              prompt={inboxZero.prompt}
              scheduleSummary="Runs every weekday at 8:00 AM"
              runs={[]}
            />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="loading">
          <Frame>
            <RoutineDetails
              prompt={inboxZero.prompt}
              scheduleSummary="Runs every weekday at 8:00 AM"
              runsLoading
            />
          </Frame>
        </SpecimenRow>
      </SpecimenSection>
    </SpecimenPage>
  );
}

export const specimen: Specimen = {
  id: "routines-routine-details",
  title: "RoutineDetails",
  group: "Routines",
  render: () => <RoutineDetailsSpecimen />,
};

export const sources: string[] = ["RoutineDetails", "RoutineRunList"];
