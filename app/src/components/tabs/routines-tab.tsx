import type { TabProps } from "../../lib/types";
import { RoutineListTab } from "./routine-list-tab";

/**
 * The Routines tab: the schedule-driven view of the routines list. Its sibling,
 * the Reactions tab, is the event-driven view; both are thin wrappers over the
 * shared `RoutineListTab`, which filters the one list by `kind`.
 */
export default function RoutinesTab(props: TabProps) {
  return <RoutineListTab {...props} kind="routine" />;
}
