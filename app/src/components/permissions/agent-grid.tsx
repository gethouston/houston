import { CatalogSectionHeader, resolveAgentColor } from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { PermissionsAgentRow } from "./agent-row";
import { useAgentAccessLine } from "./use-agent-access-line";

/**
 * The one home for "a list of agents you can open": a counted section header
 * over a two-column grid of rows, each carrying the ONE plain-language access
 * line every agent list in the app shares and opening that agent's settings.
 *
 * Settings > Permissions and a team's settings both render it, so the two can
 * never drift into two slightly different renderings of the same information.
 * Each caller keeps its OWN empty state: they are different situations (no
 * agents in the workspace at all vs. none moved into this team yet) and say
 * different things.
 */
export function PermissionsAgentGrid({
  agents,
  members,
  rowAction,
  onOpenAgent,
}: {
  agents: Agent[];
  /** Org roster used to name each agent's managers. Empty on single player. */
  members: OrgMember[];
  /** A per-row right-edge control the CALLER owns, or nothing. A team's Manage
   *  agents page hangs "Move to team" here; the org-wide Permissions list has
   *  no team to move within, so it passes none and its rows are unchanged. */
  rowAction?: (agent: Agent) => ReactNode;
  onOpenAgent: (agent: Agent) => void;
}) {
  const { t } = useTranslation("teams");
  const accessLine = useAgentAccessLine(members);

  return (
    <section>
      <CatalogSectionHeader
        title={t("permissions.agentsHeading")}
        count={agents.length}
        className="mb-2"
      />
      <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
        {agents.map((agent) => (
          <PermissionsAgentRow
            key={agent.id}
            name={agent.name}
            color={resolveAgentColor(agent.color)}
            summary={accessLine(agent)}
            openLabel={t("agentsTab.open", { name: agent.name })}
            action={rowAction?.(agent)}
            onOpen={() => onOpenAgent(agent)}
          />
        ))}
      </div>
    </section>
  );
}
