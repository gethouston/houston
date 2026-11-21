import type { Specimen } from "../../../src/specimen";
import { specimen as routineDraftRow } from "./routine-draft-row";
import { specimen as routineRow } from "./routine-row";
import { specimen as routineRowControls } from "./routine-row-controls";
import { specimen as routineRunList } from "./routine-run-list";
import { specimen as routinesGrid } from "./routines-grid";
import { specimen as routinesGridEmpty } from "./routines-grid-empty";
import { specimen as scheduleBuilder } from "./schedule-builder";
import { specimen as timezonePicker } from "./timezone-picker";
import { specimen as triggerStatusBadge } from "./trigger-status-badge";

export const specimens: readonly Specimen[] = [
  routinesGrid,
  routinesGridEmpty,
  routineRow,
  routineDraftRow,
  routineRunList,
  routineRowControls,
  scheduleBuilder,
  timezonePicker,
  triggerStatusBadge,
];
