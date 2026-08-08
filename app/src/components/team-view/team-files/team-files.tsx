import { useTranslation } from "react-i18next";
import type { TeamView } from "../../../lib/teams-model";
import { useUIStore } from "../../../stores/ui";
import { AgentFilterMenu } from "../../agent-filter-menu";
import { AgentFilesSurface } from "../../tabs/agent-files";
import { teamSelectedAgent } from "../team-agent-choice";
import { teamFilterAgentId } from "../team-agent-filter-model";
import { TeamFilesEmpty } from "../team-empty";

/**
 * A team's Files section: ONE agent's real tree, with a dropdown to change
 * which agent that is.
 *
 * **Never a merged filesystem.** The obvious-looking alternative — one tree
 * showing every agent's files at once — would invent a filesystem nobody has:
 * two agents with a `notes/` folder are two unrelated folders on two machines,
 * a rename would have to guess which one it meant, and an upload would have no
 * honest answer to where it lands. So the section shows one agent at a time,
 * with that agent's name as the tree's root label, and the dropdown is how you
 * move between them. Everything below follows from that: no aggregate query
 * key, no cross-agent fan-out, nothing to merge.
 *
 * **The dropdown is the same pin the rest of the team view uses.**
 * `teamAgentFilter` in the UI store is written by the rail's agent rows and by
 * the board's own filter menu, so clicking an agent in the sidebar narrows this
 * section too, and picking one here narrows the board. One act, three places.
 *
 * The asymmetry with the board is deliberate: the board offers "All agents" and
 * this section cannot, so when the pin is UNSET the section falls back to the
 * team's first agent (`teamSelectedAgent`) and does NOT write that choice back
 * to the store. Writing it would silently filter the team's board down to one
 * agent just because the user opened Files, which is not something they asked
 * for.
 */
export function TeamFiles({ team }: { team: TeamView }) {
  const { t } = useTranslation("teams");
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);
  const setTeamAgentFilter = useUIStore((s) => s.setTeamAgentFilter);

  const agents = team.agents;
  // The pin when it still resolves inside this team, else the first agent.
  // Null exactly when the team holds no agents.
  const selected = teamSelectedAgent(agents, teamAgentFilter);

  if (selected === null) return <TeamFilesEmpty team={team} />;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* The band carries one control and no rule under it: the Files page is
          borderless, and vertical rhythm here is spacing alone. `px-2` plus the
          pill's own 16px inset lands the agent's name exactly over the
          browser's 24px content gutter, so the two read as one column. */}
      {/* A `fieldset` rather than `role="group"`: it is the native labelled
          group (and what Biome's a11y rule asks for), so a screen reader
          entering the band hears what the trigger's agent name MEANS here
          before it hears the name. Labelling the trigger itself instead would
          replace the agent's name, which is the one word that matters. */}
      <fieldset
        // `min-w-0` overrides the UA's `min-inline-size: min-content` on a
        // fieldset, so a long agent name clips with the pane instead of
        // pushing the band wider than the browser under it.
        className="flex min-w-0 shrink-0 items-center px-2 pt-4"
        aria-label={t("teamView.files.agentLabel")}
      >
        <AgentFilterMenu
          agents={agents}
          filterPath={selected.folderPath}
          onFilterPathChange={(path) =>
            setTeamAgentFilter(teamFilterAgentId(agents, path))
          }
          // A merged cross-agent tree is not a thing: always exactly one agent.
          allowAll={false}
        />
      </fieldset>
      <AgentFilesSurface key={selected.id} agent={selected} />
    </div>
  );
}
