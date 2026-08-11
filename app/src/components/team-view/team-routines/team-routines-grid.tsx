import type { Routine } from "@houston-ai/engine-client";
import { RoutinesGrid } from "@houston-ai/routines";
import type { ReactNode } from "react";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";
import { allAgentReadsFailed } from "../../../lib/agent-read-failures";
import { TeamRoutineOwnerChip } from "./team-routine-owner-chip";
import { useTeamGridLabels } from "./use-team-grid-labels";
import type { useTeamRoutineActions } from "./use-team-routine-actions";
import type { useTeamRoutineHost } from "./use-team-routine-host";
import type { useTeamRoutinesData } from "./use-team-routines-data";

type TeamRoutinesData = ReturnType<typeof useTeamRoutinesData>;
type TeamRoutineActions = ReturnType<typeof useTeamRoutineActions>;
type TeamRoutineHost = ReturnType<typeof useTeamRoutineHost>;

/**
 * The team's merged routines list — the rows between
 * `team-routines-header.tsx` and `team-routines-footer.tsx`, and the third
 * sibling of that trio.
 *
 * Its own file because the grid is where a CROSS-agent list stops looking like
 * a per-agent one: every map it takes (last runs, drafts, trigger statuses,
 * owner chips) is keyed by the merged list's row keys, and the wording of its
 * empty state depends on how many owners are in view and whether anyone
 * answered at all. Reading `team-routines.tsx` should not mean reading that.
 *
 * Everything it shows is decided above it: it takes the section's hooks whole,
 * typed off their return types, and owns no state. Only the labels are its own
 * (pure `t()` reads), so the section above carries none of the wording.
 */
export function TeamRoutinesGrid({
  data,
  actions,
  host,
  accountTimezone,
  oneOwner,
  leadingIcon,
  createButton,
}: {
  data: TeamRoutinesData;
  actions: TeamRoutineActions;
  host: TeamRoutineHost;
  accountTimezone: string;
  /** One owner in view: the per-row owner chip would repeat one name. */
  oneOwner: boolean;
  /** Per-row identity glyph, built by the section so its toolkits fetch does
   *  not come and go with this list. */
  leadingIcon: (routine: Routine) => ReactNode;
  createButton: ReactNode;
}) {
  // Nothing answered at all. An empty list is then not evidence of an empty
  // team, so the grid must not claim one.
  const unreadable = allAgentReadsFailed(data.failures);
  const gridLabels = useTeamGridLabels({ oneOwner, unreadable });
  const labels = useRoutineLabels();

  const ownerChipFor = (key: string) => {
    const agent = data.list.ownerOf[key] ?? data.drafts.ownerOf[key];
    return agent ? <TeamRoutineOwnerChip agent={agent} /> : null;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RoutinesGrid
        routines={data.list.routines}
        lastRuns={data.list.lastRuns}
        // Routines being built in chat are rows too: without them a routine
        // half-started from here would vanish from the list the moment its
        // chat lost focus.
        draftActivities={data.drafts.drafts}
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
        // Keyed by the merged list's row keys, like every other map here:
        // without them every event routine's chip would say "verifying"
        // forever, a claim this surface could never settle.
        triggerStatuses={data.triggers.triggerStatuses}
        triggerSummaries={data.triggers.triggerSummaries}
        onReconnectTrigger={data.triggers.onReconnectTrigger}
        ownerChip={oneOwner ? undefined : (routine) => ownerChipFor(routine.id)}
        draftOwnerChip={
          oneOwner ? undefined : (draft) => ownerChipFor(draft.id)
        }
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
