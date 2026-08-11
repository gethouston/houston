import { cn } from "@houston-ai/core";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTimezonePreference } from "../../../hooks/use-timezone-preference";
import type { TeamView } from "../../../lib/teams-model";
import { useRoutineLeadingIcon } from "../../agent/routine-leading-icon";
import { AgentReadsFailed } from "../../agent-reads-failed";
import { PageHeaderTools } from "../../shell/page-header/page-header-tools";
import { teamScopedAgents } from "../team-agent-choice";
import { TeamAgentFilterCapsule } from "../team-agent-filter-capsule";
import { TeamRoutinesEmpty } from "../team-empty";
import { TeamRoutinesCreateButton } from "./team-routines-create-button";
import { TeamRoutinesFooter } from "./team-routines-footer";
import { TeamRoutinesGrid } from "./team-routines-grid";
import { TeamRoutinesHeader } from "./team-routines-header";
import { useTeamRoutineActions } from "./use-team-routine-actions";
import { useTeamRoutineHost } from "./use-team-routine-host";
import { useTeamRoutinesData } from "./use-team-routines-data";

/**
 * A team's Routines section: everything the team's agents do on their own, in
 * ONE list: a persistent list on the left, the selected routine's CHAT in the
 * shared shell panel on the right, plus the one thing a cross-agent list
 * forces — each row says whose routine it is, and every action routes back to
 * that owner.
 *
 * The read is a fan-out over the SAME per-agent query keys every other routines
 * read uses (see `use-team-routines-data.ts`), and agents that fail are NAMED
 * rather than dropped, because a short list that looks complete is the failure
 * mode of a merged one.
 */
export function TeamRoutines({
  team,
  agentFocusId,
}: {
  team: TeamView;
  agentFocusId?: string;
}) {
  const { t } = useTranslation(["teams", "routines"]);
  const tz = useTimezonePreference();
  // This section's OWN filter, not the team-wide pin: narrowing this list must
  // not silently narrow the board the user goes back to
  // (`team-agent-filter-capsule.tsx` says why). It resets with the section,
  // which remounts per team because `TeamView` keys it on the team id — so a
  // tab click always opens Routines team-wide.
  const [localFilterAgentId, setFilterAgentId] = useState<string | null>(null);
  const filterAgentId = agentFocusId ?? localFilterAgentId;

  // Memoized because it is the dependency every read below memoizes on — a
  // fresh array per render would rebuild the merged list and re-arm the
  // trigger timeout with it. Narrowing here narrows the FAN-OUT as well as the
  // rows, and costs nothing to undo: every agent keeps its own query key, so
  // widening again reads from cache.
  const scoped = useMemo(
    () => teamScopedAgents(team.agents, filterAgentId),
    [team.agents, filterAgentId],
  );
  const data = useTeamRoutinesData(scoped);
  const actions = useTeamRoutineActions(data.list, data.drafts);
  const host = useTeamRoutineHost({
    scoped,
    teamAgents: team.agents,
    list: data.list,
    drafts: data.drafts,
    accountTimezone: tz.timezone ?? "UTC",
    triggerSummaries: data.triggers.triggerSummaries,
  });
  // Per-row identity glyph. It needs nothing per agent — only whether this host
  // has a trigger surface at all — so the merged list reuses it unchanged.
  const leadingIcon = useRoutineLeadingIcon(data.triggers.triggersEnabled);
  // One owner in view (a one-agent team, or the dropdown narrowed to one): the
  // chip would repeat the same name down the whole list, so it drops.
  const oneOwner = scoped.length <= 1;

  // Hooks may not run conditionally, so both honest non-list states come after
  // every hook above.
  if (team.agents.length === 0) return <TeamRoutinesEmpty team={team} />;

  // Schedule rows render against the real account zone, so the list waits for
  // the timezone roundtrip once per open.
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

  const createButton = (
    <TeamRoutinesCreateButton onClick={host.startNewRoutine} />
  );

  return (
    <div className="flex h-full min-h-0">
      {!host.screenOpen && (
        <div
          className={cn(
            "flex min-w-0 flex-col",
            host.chatOpen ? "flex-1" : "mx-auto w-full max-w-3xl",
          )}
        >
          <PageHeaderTools>
            {(oneRow) => (
              <TeamRoutinesHeader
                variant={oneRow ? "strip" : "row"}
                count={count}
                agentFilter={
                  agentFocusId ? undefined : (
                    <TeamAgentFilterCapsule
                      agents={team.agents}
                      selectedAgentId={filterAgentId}
                      onSelect={setFilterAgentId}
                    />
                  )
                }
                createButton={listEmpty ? undefined : createButton}
              />
            )}
          </PageHeaderTools>

          {/* The strip pays the list's own gutter, so its left edge lands on the
            rows' rather than four pixels inside them. */}
          <div className="px-3">
            <AgentReadsFailed
              failures={data.failures}
              onRetry={data.retry}
              retrying={data.retrying}
            />
          </div>

          <TeamRoutinesGrid
            data={data}
            actions={actions}
            host={host}
            accountTimezone={tz.timezone}
            oneOwner={oneOwner}
            leadingIcon={leadingIcon}
            createButton={createButton}
          />

          {/* The zone every schedule above is read in, and the one place to
            change it. Drops with the list: an empty state has no schedules. */}
          {!listEmpty && <TeamRoutinesFooter tz={tz} />}
        </div>
      )}

      {/* The selected routine's chat, portaled into the shared shell panel, plus
          the "which agent?" picker. Neither adds layout here. */}
      {host.node}
    </div>
  );
}
