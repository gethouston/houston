import { Skeleton } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useTeams } from "../../hooks/use-teams";
import { hasAgentTeams } from "../../lib/org-roles";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHero } from "../shell/page-shell";
import { teamTreeRows } from "./teams-home-model";
import { TeamTreeBlock } from "./teams-home-tree";

/**
 * The phone's Teams tab root: every team as a tree row with the sections it
 * offers this caller indented beneath it.
 *
 * The tree exists because the phone has no rail and no section strip — a team's
 * sections have to be somewhere, and a list of them under the team is the one
 * place that stays honest as teams come and go. Tapping a section PUSHES the
 * team view (`team-chrome.tsx` draws the phone's back chip for it), so the
 * tree is the level every team screen retreats to.
 *
 * Flat, gutterless "plane" rows on the screen surface: no cards, so the guide
 * line under each team is the only structure the eye has to follow.
 */
export function TeamsHomeView() {
  const { t } = useTranslation("shell");
  const teams = useTeams();
  const { capabilities } = useCapabilities();
  // The rail's own rule for its "New team" action (use-server-team-actions):
  // a server-teams host always offers it, a local one to whoever may create
  // agents.
  const { canCreate: canCreateAgents } = useCanCreateAgents();
  const canCreateTeam = hasAgentTeams(capabilities) || canCreateAgents;
  const rows = useMemo(
    () => teamTreeRows(teams, capabilities),
    [capabilities, teams],
  );

  return (
    <div data-testid="teams-home" className="flex h-full flex-col">
      <PageContainer className="shrink-0 pt-6">
        <PageHero
          title={t("teamsHome.title")}
          className="mb-4 px-3"
          trailing={
            canCreateTeam ? (
              <NewTeamButton label={t("teamsHome.newTeam")} />
            ) : undefined
          }
        />
      </PageContainer>
      <PageContainer className="min-h-0 flex-1 overflow-y-auto pb-6">
        {rows.length === 0 ? (
          <TeamsTreeSkeleton />
        ) : (
          <ul aria-label={t("teamsHome.tree")}>
            {rows.map((row) => (
              <TeamTreeBlock key={row.team.id} row={row} />
            ))}
          </ul>
        )}
      </PageContainer>
    </div>
  );
}

/**
 * Every workspace has at least its default team, so an empty list means the
 * teams have not RESOLVED yet, never that there are none. The placeholder
 * mirrors the tree's tracks so the real rows land without a shift.
 */
function TeamsTreeSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex min-h-10 items-center gap-2 px-3">
        <Skeleton className="size-4 shrink-0 rounded-sm" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="ml-3 border-l border-line pl-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex min-h-12 items-center gap-3 px-3">
            <Skeleton className="size-5 shrink-0 rounded-sm" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The phone's create-team control, the twin of the Agents home's New agent
 *  chip: the rail that carries "New team" on the desktop is not rendered
 *  below md, so the tree's title row offers it instead. */
function NewTeamButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid="teams-home-new-team"
      onClick={() => useUIStore.getState().setCreateTeamDialogOpen(true)}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chip text-ink transition-colors active:scale-[0.96] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ht-hairline"
    >
      <Plus className="size-5" />
    </button>
  );
}
