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

const ALL_GROUPS = "all";

export function AgentsHomeTeamFilter({
  teams,
  selected,
  onSelect,
}: {
  teams: readonly TeamView[];
  selected: TeamView | null;
  onSelect: (teamId: string | null) => void;
}) {
  const { t } = useTranslation(["shell", "teams"]);
  const allGroups = t("shell:agentsHome.allGroups");
  const name = (team: TeamView) => teamDisplayName(team);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
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
            {selected ? name(selected) : allGroups}
          </span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuRadioGroup
          value={selected?.id ?? ALL_GROUPS}
          onValueChange={(value) =>
            onSelect(value === ALL_GROUPS ? null : value)
          }
        >
          <DropdownMenuRadioItem
            value={ALL_GROUPS}
            data-testid="agents-home-team-option"
            data-team-id={ALL_GROUPS}
          >
            {allGroups}
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
