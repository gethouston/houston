import type { Routine } from "@houston/engine-adapter";
import { RoutinesGrid } from "@houston-ai/routines";
import type { ReactNode } from "react";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";
import { useRoutineScheduleFloor } from "../../../hooks/use-routine-schedule-floor";
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
  leadingIcon: (routine: Routine) => ReactNode;
  createButton: ReactNode;
}) {
  const unreadable = allAgentReadsFailed(data.failures);
  const gridLabels = useTeamGridLabels({ unreadable });
  const labels = useRoutineLabels();
  const scheduleFloor = useRoutineScheduleFloor();

  const warningChipFor = (routine: Routine) => (
    <RoutineWarningChip agent={agent} routine={routine} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RoutinesGrid
        routines={data.list.routines}
        lastRuns={data.list.lastRuns}
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
        triggerStatuses={data.triggers.triggerStatuses}
        triggerSummaries={data.triggers.triggerSummaries}
        onReconnectTrigger={data.triggers.onReconnectTrigger}
        warningChip={warningChipFor}
        labels={gridLabels}
        rowLabels={labels.rowLabels}
        scheduleLabels={labels.schedule}
        scheduleFloor={scheduleFloor}
        scheduleSummaryLabels={labels.schedule.summary}
        triggerLabels={labels.trigger}
        nextFireLabels={labels.nextFire}
        locale={labels.locale}
        emptyAction={unreadable ? undefined : createButton}
      />
    </div>
  );
}
