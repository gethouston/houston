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

function RoutineDetailsSpecimen() {
  return (
    <SpecimenPage
      title="RoutineDetails"
      intro="The routine chat header's details popover body (PRODUCT-1208): the instruction verbatim — the prompt IS what the routine does — over the recorded run history. Read-only by design; acting on a run stays on the row and the board."
    >
      <SpecimenSection
        title="States"
        note="Every outcome the run list can show: running (spinner), done (surfaced), nothing to report (silent), failed, stopped. Failed and done rows carry the summary the run left behind."
      >
        <SpecimenRow label="full history">
          <div className="w-96 rounded-xl bg-popover p-4 ht-hairline">
            <RoutineDetails prompt={inboxZero.prompt} runs={history} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="no runs yet">
          <div className="w-96 rounded-xl bg-popover p-4 ht-hairline">
            <RoutineDetails prompt={inboxZero.prompt} runs={[]} />
          </div>
        </SpecimenRow>
        <SpecimenRow label="loading">
          <div className="w-96 rounded-xl bg-popover p-4 ht-hairline">
            <RoutineDetails prompt={inboxZero.prompt} runsLoading />
          </div>
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
