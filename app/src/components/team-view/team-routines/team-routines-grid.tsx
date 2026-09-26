import type { Routine } from "@houston/engine-adapter";
import { RoutinesGrid } from "@houston-ai/routines";
import type { ReactNode } from "react";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";
import { allAgentReadsFailed } from "../../../lib/agent-read-failures";
import type { Agent } from "../../../lib/types";
import { RoutineWarningChip } from "../../agent/routine-warning-chip";
import { useTeamGridLabels } from "./use-team-grid-labels";
import type { useTeamRoutineActions } from "./use-team-routine-actions";
import type { useTeamRoutineHost } from "./use-team-routine-host";
import type { useTeamRoutinesData } from "./use-team-routines-data";

type TeamRoutinesData = ReturnType<typeof useTeamRoutinesData>;
type TeamRoutineActions = ReturnType<typeof useTeamRoutineActions>;
type TeamRoutineHost = ReturnType<typeof useTeamRoutineHost>;

/**
 * The employee's routines list: the rows between `team-routines-header.tsx`
 * and `team-routines-footer.tsx`, and the third sibling of that trio.
 *
 * The wording of its empty state depends on whether the employee answered at
 * all.
 *
 * Everything it shows is decided above it: it takes the section's hooks whole,
 * typed off their return types, and owns no state. Only the labels are its own
 * (pure `t()` reads), so the section above carries none of the wording.
 */
export function TeamRoutinesGrid({
  agent,
  data,
  actions,
  host,
  accountTimezone,
  leadingIcon,
  createButton,
}: {
  agent: Agent;
  data: TeamRoutinesData;
  actions: TeamRoutineActions;
  host: TeamRoutineHost;
  accountTimezone: string;
  /** Per-row identity glyph, built by the section so its toolkits fetch does
   *  not come and go with this list. */
  leadingIcon: (routine: Routine) => ReactNode;
  createButton: ReactNode;
}) {
  // Nothing answered at all. An empty list is then not evidence of an empty
  // routines list, so the grid must not claim one.
  const unreadable = allAgentReadsFailed(data.failures);
  const gridLabels = useTeamGridLabels({ unreadable });
  const labels = useRoutineLabels();

  // "This one will fail": an unpinned routine runs on whatever the employee
  // runs on. The chip renders itself away when the row is fine.
  const warningChipFor = (routine: Routine) => (
    <RoutineWarningChip agent={agent} routine={routine} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RoutinesGrid
        routines={data.list.routines}
        lastRuns={data.list.lastRuns}
        // Routines being built in chat are rows too: without them a routine
        // half-started from here would vanish from the list the moment its
        // chat lost focus.
        draftActivities={data.drafts}
        accountTimezone={accountTimezone}
        loading={data.loading}
        selectedRoutineId={host.selectedRoutineKey}
        selectedDraftId={host.selectedDraftKey}
        onOpenChat={host.openRoutineChat}
        onToggle={actions.onToggle}
        onScheduleChange={actions.onScheduleChange}
        onDeleteRoutine={actions.onDeleteRoutine}
        onRunNow={actions.onRunNow}
        onStopRun={actions.onStopRun}
        onResumeDraft={host.resumeDraft}
        onDiscardDraft={actions.onDiscardDraft}
        leadingIcon={leadingIcon}
        // Without them every event routine's chip would say "verifying"
        // forever, a claim this surface could never settle.
        triggerStatuses={data.triggers.triggerStatuses}
        triggerSummaries={data.triggers.triggerSummaries}
        onReconnectTrigger={data.triggers.onReconnectTrigger}
        warningChip={warningChipFor}
        labels={gridLabels}
        rowLabels={labels.rowLabels}
        scheduleLabels={labels.schedule}
        scheduleSummaryLabels={labels.schedule.summary}
        triggerLabels={labels.trigger}
        nextFireLabels={labels.nextFire}
        locale={labels.locale}
        emptyAction={unreadable ? undefined : createButton}
      />
    </div>
  );
}
