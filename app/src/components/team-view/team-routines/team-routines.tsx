import { Button, cn } from "@houston-ai/core";
import { RoutinesGrid } from "@houston-ai/routines";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useRoutineLabels } from "../../../hooks/use-routine-labels";
import { useTimezonePreference } from "../../../hooks/use-timezone-preference";
import { allAgentReadsFailed } from "../../../lib/agent-read-failures";
import type { TeamView } from "../../../lib/teams-model";
import { useUIStore } from "../../../stores/ui";
import { AgentReadsFailed } from "../../agent-reads-failed";
import { useRoutineLeadingIcon } from "../../tabs/routine-leading-icon";
import { teamScopedAgents } from "../team-agent-choice";
import { TeamRoutinesEmpty } from "../team-empty";

import { TeamRoutineOwnerChip } from "./team-routine-owner-chip";
import { TeamRoutinesHeader } from "./team-routines-header";
import { useTeamRoutineActions } from "./use-team-routine-actions";
import { useTeamRoutineHost } from "./use-team-routine-host";
import { useTeamRoutinesData } from "./use-team-routines-data";

/**
 * A team's Routines section: everything the team's agents do on their own, in
 * ONE list. It reads like the per-agent Routines tab — a persistent list on the
 * left, the selected routine's CHAT in the shared shell panel on the right —
 * with the one difference a cross-agent list forces: each row says whose
 * routine it is, and every action routes back to that owner.
 *
 * The read is a fan-out over the SAME per-agent query keys the tab uses (see
 * `use-team-routines-data.ts`), and agents that fail are NAMED rather than
 * dropped, because a short list that looks complete is the failure mode of a
 * merged one.
 */
export function TeamRoutines({ team }: { team: TeamView }) {
  const { t } = useTranslation(["teams", "routines"]);
  const labels = useRoutineLabels();
  const tz = useTimezonePreference();
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);
  const setTeamAgentFilter = useUIStore((s) => s.setTeamAgentFilter);

  // The ONE pin every team surface shares: the rail's agent click and this
  // section's dropdown are the same act, in both directions. Memoized because
  // it is the dependency every read below memoizes on — a fresh array per
  // render would rebuild the merged list and re-arm the trigger timeout with it.
  const scoped = useMemo(
    () => teamScopedAgents(team.agents, teamAgentFilter),
    [team.agents, teamAgentFilter],
  );
  const data = useTeamRoutinesData(scoped);
  const actions = useTeamRoutineActions(data.list, data.drafts);
  const host = useTeamRoutineHost({
    scoped,
    list: data.list,
    drafts: data.drafts,
    accountTimezone: tz.timezone ?? "UTC",
  });
  // Per-row identity glyph, exactly as the tab builds it. It needs nothing per
  // agent — only whether this host has a trigger surface at all — so the merged
  // list reuses it unchanged.
  const leadingIcon = useRoutineLeadingIcon(data.triggers.triggersEnabled);

  // Hooks may not run conditionally, so both honest non-list states come after
  // every hook above.
  if (team.agents.length === 0) return <TeamRoutinesEmpty team={team} />;

  // Schedule rows render against the real account zone, so the list waits for
  // the timezone roundtrip once per open, exactly as the tab does.
  if (!tz.loaded || !tz.timezone) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-sm text-ink-muted">
          {t("routines:loading")}
        </p>
      </div>
    );
  }

  const count = data.list.routines.length;
  // Genuinely nothing to show: the grid renders ONLY its empty state, which
  // carries the create button, so the header lets go of it. One draft row is
  // enough to end that — the grid has rows again, and the header takes the
  // button back.
  const listEmpty = count === 0 && data.drafts.drafts.length === 0;
  // One owner in view (a one-agent team, or the dropdown narrowed to one): the
  // chip would repeat the same name down the whole list, so it drops.
  const oneOwner = scoped.length <= 1;
  // Nothing answered at all. An empty list is then not evidence of an empty
  // team, so the grid must not claim one.
  const unreadable = allAgentReadsFailed(data.failures);

  // The grid owns the empty state; the section only words it. Across the team
  // "no routines" is a fact about the team, so it says so; narrowed to one
  // agent the per-agent copy is the honest one. With every read failed, neither
  // is a fact — the strip's Retry is the only honest next move, so the empty
  // state says exactly that and offers no create button competing with it.
  const gridLabels = unreadable
    ? {
        ...labels.grid,
        emptyTitle: t("teams:teamView.routines.unreadable.title"),
        emptyDescription: t("teams:teamView.routines.unreadable.body"),
      }
    : oneOwner
      ? labels.grid
      : {
          ...labels.grid,
          emptyTitle: t("teams:teamView.routines.noRoutines.title"),
          emptyDescription: t("teams:teamView.routines.noRoutines.body"),
        };

  const createButton = (
    <Button onClick={host.startNewRoutine}>
      <Plus className="size-4" />
      {t("teams:teamView.routines.newRoutine")}
    </Button>
  );

  const ownerChipFor = (key: string) => {
    const agent = data.list.ownerOf[key] ?? data.drafts.ownerOf[key];
    return agent ? <TeamRoutineOwnerChip agent={agent} /> : null;
  };

  return (
    <div className="flex h-full min-h-0">
      <div
        className={cn(
          "flex min-w-0 flex-col",
          host.chatOpen ? "flex-1" : "mx-auto w-full max-w-3xl",
        )}
      >
        <TeamRoutinesHeader
          agents={team.agents}
          pinnedAgentId={teamAgentFilter}
          onPinAgent={setTeamAgentFilter}
          count={count}
          createButton={listEmpty ? undefined : createButton}
        />

        {/* The strip pays the list's own gutter, so its left edge lands on the
            rows' rather than four pixels inside them. */}
        <div className="px-3">
          <AgentReadsFailed
            failures={data.failures}
            onRetry={data.retry}
            retrying={data.retrying}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <RoutinesGrid
            routines={data.list.routines}
            lastRuns={data.list.lastRuns}
            // Routines being built in chat are rows too, on this surface as on
            // the tab: without them a routine half-started from here would
            // vanish from the list the moment its chat lost focus.
            draftActivities={data.drafts.drafts}
            accountTimezone={tz.timezone}
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
            ownerChip={
              oneOwner ? undefined : (routine) => ownerChipFor(routine.id)
            }
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
      </div>

      {/* The selected routine's chat, portaled into the shared shell panel, plus
          the "which agent?" picker. Neither adds layout here. */}
      {host.node}
    </div>
  );
}
