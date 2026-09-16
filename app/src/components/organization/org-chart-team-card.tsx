import type { OrgMember } from "@houston/engine-adapter";
import { Skeleton } from "@houston-ai/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAgentTeamMembers } from "../../hooks/queries";
import { useWorkspaceSectionActive } from "../../hooks/use-workspace-section-active";
import { teamDisplayName } from "../../lib/team-display";
import type { TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { TeamGlyph } from "../shell/team-glyph";
import { OrgChartAgentRow } from "./org-chart-agent-row";
import { CARD_SURFACE } from "./org-chart-cards";
import { type OrgChartUsage, orgChartMembers } from "./org-chart-model";
import { OrgChartPeopleStrip } from "./org-chart-people-row";
import {
  type OrgChartUsageState,
  orgChartMembersState,
  orgChartTeamMembership,
} from "./org-chart-view-model";

/** The header over each half of a card, on the section-header scale (DESIGN.md
 *  §4) — a card is read as "the people, then the agents", and a 12px muted
 *  caption would read as a note about the rows rather than as their heading. */
function GroupLabel({ children }: { children: string }) {
  return <p className="mb-2 text-sm font-medium text-ink">{children}</p>;
}

/**
 * One team as the org chart draws it: the team's mark and name over its people,
 * then every agent it runs. Reading down a card answers "who is this team, and
 * what does it operate"; reading across the cards answers "who does the most
 * work here", because every bar is scaled to the same busiest agent.
 *
 * The header is the way in — a click opens the team's Mission Control, the same
 * place its rail row leads to — so the chart is a map you can travel, not a
 * picture of one. Whose humans the card lists is the pure
 * {@link orgChartTeamMembership} plus `orgChartMembers`: only a named team on a
 * teams-capable gateway has explicit membership rows to read, so only that case
 * spends a request.
 */
export function OrgChartTeamCard({
  team,
  roster,
  personal,
  serverBacked,
  selfId,
  usage,
  scale,
  state,
}: {
  team: TeamView;
  /** The workspace's humans, already resolved for this space. */
  roster: readonly OrgMember[];
  personal: boolean;
  /** Whether an `agentTeams` gateway owns the teams (C13). */
  serverBacked: boolean;
  selfId: string | null;
  usage: OrgChartUsage;
  scale: number;
  state: OrgChartUsageState;
}) {
  const { t } = useTranslation("teams");
  const openTeamView = useUIStore((s) => s.openTeamView);
  const membership = orgChartTeamMembership({
    personal,
    serverBacked,
    isDefault: team.isDefault,
  });
  // Admin lives in kept-alive Settings, so the read is gated on its section
  // actually being the screen on the glass.
  const onScreen = useWorkspaceSectionActive();
  const { data, isPending, isError } = useAgentTeamMembers(
    team.id,
    membership.readsMembers && onScreen,
  );
  const members = orgChartMembersState({
    readsMembers: membership.readsMembers,
    isPending,
    isError,
  });
  const people = useMemo(
    () =>
      orgChartMembers({
        // `everyone` IS the "no explicit rows to read" case the model calls
        // default: the whole roster belongs to this card.
        isDefault: membership.everyone,
        personal,
        roster,
        members: data ?? [],
      }),
    [membership.everyone, personal, roster, data],
  );
  const name = teamDisplayName(team, t("teamView.defaultName"));

  return (
    <li className={CARD_SURFACE}>
      <button
        type="button"
        aria-label={t("orgChart.openTeam", { name })}
        onClick={() => openTeamView(team.id, "mission-control")}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <TeamGlyph team={team} className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {name}
          </span>
          {/* The people half of the count waits for the membership read:
              "0 people" off an unsettled `data` claims a team nobody is in. */}
          {members === "loading" ? (
            <Skeleton className="mt-1.5 h-3 w-24 rounded-full" />
          ) : (
            <span className="block truncate text-xs text-ink-muted tabular-nums">
              {members === "ready"
                ? `${t("orgChart.people", { count: people.length })} · ${t(
                    "orgChart.agents",
                    { count: team.agents.length },
                  )}`
                : t("orgChart.agents", { count: team.agents.length })}
            </span>
          )}
        </span>
      </button>

      <div className="mt-4 px-1">
        <GroupLabel>{t("orgChart.people")}</GroupLabel>
        <OrgChartPeopleStrip
          people={people}
          selfId={selfId}
          messagesOf={(userId) => usage.byPerson.get(userId) ?? 0}
          state={state}
          members={members}
        />
      </div>

      <div className="mt-4 border-t border-line/60 pt-3">
        <GroupLabel>{t("orgChart.agents")}</GroupLabel>
        {team.agents.length === 0 ? (
          <p className="px-1 text-sm text-ink-muted">
            {t("orgChart.emptyTeam")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {team.agents.map((agent) => (
              <OrgChartAgentRow
                key={agent.id}
                agent={agent}
                messages={usage.byAgent.get(agent.id) ?? 0}
                scale={scale}
                state={state}
              />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
