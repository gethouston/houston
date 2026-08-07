import type { Specimen } from "../../../src/specimen";
import { specimen as routineDetails } from "./routine-details";
import { specimen as routineDraftRow } from "./routine-draft-row";
import { specimen as routineRow } from "./routine-row";
import { specimen as routineRowControls } from "./routine-row-controls";
import { specimen as routinesGrid } from "./routines-grid";
import { specimen as routinesGridEmpty } from "./routines-grid-empty";
import { specimen as scheduleBuilder } from "./schedule-builder";
import { specimen as timezonePicker } from "./timezone-picker";
import { specimen as triggerStatusBadge } from "./trigger-status-badge";

/**
 * The **Routines** area (`@houston-ai/routines`): an agent's scheduled and
 * event-triggered work — the list pane, the rows it is built from, the schedule
 * builder behind every cron, the account-wide timezone, and the badge that says
 * whether an event routine can actually fire.
 *
 * One file per component (`<component>.tsx`, exporting
 * `export const specimen: Specimen` with `group: "Routines"` alongside
 * `export const sources: string[]`), listed below outside-in: the whole pane
 * first, then the rows it renders, then the controls each row composes.
 * `sample.ts` holds the four routines every page renders against, so a row
 * reviewed alone is the same row reviewed inside the list.
 *
 * Not documented here: the pure helpers the package also exports
 * (`cronSummary`, `presetSummary`, `nextFire`, `describeNextFire`, `interp`,
 * the `triggerBadgeState` view helpers) and the `DEFAULT_*` label objects. They
 * paint no pixel of their own — `ui/routines/tests` covers them.
 */
export const specimens: readonly Specimen[] = [
  routinesGrid,
  routinesGridEmpty,
  routineRow,
  routineDraftRow,
  routineDetails,
  routineRowControls,
  scheduleBuilder,
  timezonePicker,
  triggerStatusBadge,
];
