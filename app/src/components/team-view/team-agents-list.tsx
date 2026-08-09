import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { PermissionsAgentGrid } from "../permissions/agent-grid";
import { AgentRowMenu } from "./agent-row-menu";

/**
 * The team's agents as flat rows: the SAME {@link PermissionsAgentGrid}
 * Settings > Permissions renders, so a row reads identically through either
 * door and clicking one drills into the same agent settings page.
 *
 * A team with no agents gets a designed empty state, not a bare line: it is a
 * real state (a group made in the sidebar before anything moved into it), and
 * it is worded like the team's Mission Control empty state so the same team in
 * the same situation says the same thing in both of its sections.
 */
export function TeamAgentsList({
  agents,
  teamId,
  isDefaultTeam,
  members,
  onOpenAgent,
}: {
  agents: Agent[];
  /** The team these rows belong to: the one team "Move to team" leaves out. */
  teamId: string;
  /** The workspace's own team: a new agent lands here, so its empty state says
   *  "create one" where a named team's says "drag one in". */
  isDefaultTeam: boolean;
  /** Org roster used to name each agent's managers. Empty on single player. */
  members: OrgMember[];
  onOpenAgent: (agent: Agent) => void;
}) {
  const { t } = useTranslation("teams");

  if (agents.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>
            {isDefaultTeam
              ? t("teamView.settings.empty.workspaceTitle")
              : t("teamView.settings.empty.teamTitle")}
          </EmptyTitle>
          <EmptyDescription>
            {isDefaultTeam
              ? t("teamView.settings.empty.workspaceBody")
              : t("teamView.settings.empty.teamBody")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <PermissionsAgentGrid
      agents={agents}
      members={members}
      // Everything you can do TO an agent, on the page that is about
      // administering them. It absorbed the rail's agent menu (rename, colour,
      // delete) when that menu left the sidebar, and the cross-team DRAG the
      // rail no longer offers.
      rowAction={(agent) => <AgentRowMenu agent={agent} teamId={teamId} />}
      onOpenAgent={onOpenAgent}
    />
  );
}
