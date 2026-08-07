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
  isDefaultTeam,
  members,
  onOpenAgent,
}: {
  agents: Agent[];
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
      onOpenAgent={onOpenAgent}
    />
  );
}
