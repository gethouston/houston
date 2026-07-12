import type { TabProps } from "../../lib/types";
import { RoutineListTab } from "./routine-list-tab";

/**
 * The Reactions tab: the event-driven view of the routines list — automations
 * that wake the moment something happens in a connected app, rather than on a
 * schedule (C9). Shown only when `capabilities.triggers` is on (see
 * `visibleAgentTabs`). A thin wrapper over the shared `RoutineListTab`, which
 * filters the one routines list to the ones that carry an event `trigger`.
 */
export default function ReactionsTab(props: TabProps) {
  return <RoutineListTab {...props} kind="reaction" />;
}
