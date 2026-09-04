import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, UsersRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { teamDisplayName } from "../../lib/team-display";
import type { TeamView } from "../../lib/teams-model";
import { TeamGlyph } from "../shell/team-glyph";

/** The radio value standing for "every team": a team id can never be it. */
const ALL_TEAMS = "all";

/**
 * The phone Agents home's team selector: one pill under the title that names
 * the team the list is narrowed to ("All teams" by default) and drops a menu
 * of every team to pick from. Props only: the caller resolves the choice and
 * holds it, so the pill can never claim a team the list is not showing.
 *
 * A menu rather than a row of chips because a workspace may hold more teams
 * than a phone's width holds chips, and a filter that scrolls off screen is a
 * filter the user cannot see is applied.
 */
export function AgentsHomeTeamFilter({
  teams,
  selected,
  onSelect,
}: {
  teams: readonly TeamView[];
  /** The resolved choice, `null` for every team. */
  selected: TeamView | null;
  onSelect: (teamId: string | null) => void;
}) {
  const { t } = useTranslation(["shell", "teams"]);
  const allTeams = t("shell:agentsHome.allTeams");
  const name = (team: TeamView) =>
    teamDisplayName(team, t("teams:teamView.defaultName"));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* No `aria-label`: the visible text IS the control's name, so a
            screen reader hears the current choice, not a generic label. */}
        <button
          type="button"
          data-testid="agents-home-team-filter"
          className="ht-hairline inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-chip pr-3 pl-3 text-[13px] font-weight-510 text-ink transition-colors hover:bg-hover active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {selected ? (
            <TeamGlyph team={selected} className="size-4 shrink-0" />
          ) : (
            <UsersRound
              aria-hidden
              className="size-4 shrink-0 text-ink-muted"
            />
          )}
          <span className="min-w-0 truncate">
            {selected ? name(selected) : allTeams}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuRadioGroup
          value={selected?.id ?? ALL_TEAMS}
          onValueChange={(value) =>
            onSelect(value === ALL_TEAMS ? null : value)
          }
        >
          <DropdownMenuRadioItem
            value={ALL_TEAMS}
            data-testid="agents-home-team-option"
            data-team-id={ALL_TEAMS}
          >
            {allTeams}
          </DropdownMenuRadioItem>
          {teams.map((team) => (
            <DropdownMenuRadioItem
              key={team.id}
              value={team.id}
              data-testid="agents-home-team-option"
              data-team-id={team.id}
              className="gap-2"
            >
              <TeamGlyph team={team} className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{name(team)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
