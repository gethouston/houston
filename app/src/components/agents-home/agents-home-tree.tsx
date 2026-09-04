import { useTranslation } from "react-i18next";
import { teamDisplayName } from "../../lib/team-display";
import type { TeamView } from "../../lib/teams-model";
import { TeamGlyph } from "../shell/team-glyph";
import { AgentHomeRowCell } from "./agent-home-row";
import type { AgentHomeRow, AgentTreeSection } from "./agents-home-model";

/**
 * The phone's Agents tree: every team that has agents as a bold, NON-tappable
 * row with its agents indented under a guide line — the same grammar the Teams
 * tree uses, because the two trees are the same object seen from two sides and
 * a second shape would read as a different kind of list.
 *
 * The team row is inert for the Teams tree's reason: a team's own screens live
 * one tab over, so a tappable header here would open something the user did
 * not name. A section with no team is the FLAT case (one team in the whole
 * workspace): its rows sit at the top level, because one header repeated on
 * every screen names nothing.
 */
export function AgentsTree({
  sections,
  onOpen,
}: {
  sections: readonly AgentTreeSection[];
  onOpen: (row: AgentHomeRow) => void;
}) {
  return (
    <ul>
      {sections.map((section) =>
        section.team === null ? (
          section.rows.map((row) => (
            <li key={row.agent.id}>
              <AgentHomeRowCell row={row} onOpen={onOpen} />
            </li>
          ))
        ) : (
          <TeamBand
            key={section.team.id}
            team={section.team}
            rows={section.rows}
            onOpen={onOpen}
          />
        ),
      )}
    </ul>
  );
}

function TeamBand({
  team,
  rows,
  onOpen,
}: {
  team: TeamView;
  rows: readonly AgentHomeRow[];
  onOpen: (row: AgentHomeRow) => void;
}) {
  const { t } = useTranslation("teams");
  const headingId = `agents-home-team-${team.id}`;
  return (
    <li className="mb-2">
      <div
        data-testid="agents-home-team"
        data-team-id={team.id}
        className="flex min-h-10 items-center gap-2 px-3"
      >
        <TeamGlyph team={team} className="size-4 shrink-0" />
        <h2
          id={headingId}
          className="min-w-0 truncate text-base font-weight-510 text-ink"
        >
          {teamDisplayName(team, t("teamView.defaultName"))}
        </h2>
      </div>
      <ul
        aria-labelledby={headingId}
        className="ml-3 border-l border-line pl-3"
      >
        {rows.map((row) => (
          <li key={row.agent.id}>
            <AgentHomeRowCell row={row} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </li>
  );
}
