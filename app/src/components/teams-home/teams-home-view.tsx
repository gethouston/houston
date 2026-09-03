import { Skeleton } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { useTeams } from "../../hooks/use-teams";
import { hasSpaces } from "../../lib/org-roles";
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
  const personalSpace = usePersonalSpace();
  const spacesHost = hasSpaces(capabilities);
  const rows = useMemo(
    () => teamTreeRows(teams, capabilities, { personalSpace, spacesHost }),
    [capabilities, personalSpace, spacesHost, teams],
  );

  return (
    <div data-testid="teams-home" className="flex h-full flex-col">
      <PageContainer className="shrink-0 pt-6">
        <PageHero title={t("teamsHome.title")} className="mb-4 px-3" />
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
