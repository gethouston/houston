import { type RoutineRun, RoutineRunList } from "@houston-ai/routines";

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

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="w-[28rem] max-w-full">{children}</div>;
}

function RoutineRunListSpecimen() {
  return (
    <SpecimenPage
      title="RoutineRunList"
      intro="A routine's execution history (PRODUCT-1208), shown in the routine screen's Runs modal: outcome, date, time, elapsed time, and the result summary a non-silent run left behind. With a run-open handler each row is a button that opens that run's chat."
    >
      <SpecimenSection
        title="States"
        note="Every outcome: running (spinner), done (surfaced), nothing to report (silent), failed, stopped. Failed and done rows carry the run's summary."
      >
        <SpecimenRow label="full history (clickable rows)">
          <Frame>
            <RoutineRunList runs={history} onOpenRun={noop} />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="read-only">
          <Frame>
            <RoutineRunList runs={history.slice(1, 3)} />
          </Frame>
        </SpecimenRow>
        <SpecimenRow label="no runs yet">
          <Frame>
            <RoutineRunList runs={[]} />
          </Frame>
        </SpecimenRow>
      </SpecimenSection>
    </SpecimenPage>
  );
}

export const specimen: Specimen = {
  id: "routines-routine-run-list",
  title: "RoutineRunList",
  group: "Routines",
  render: () => <RoutineRunListSpecimen />,
};

export const sources: string[] = ["RoutineRunList"];
