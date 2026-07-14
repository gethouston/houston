import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
  resolveAgentColor,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { OrgAgentCard } from "./org-agent-card";
import { summarizeAgentAccess } from "./org-agents-model";
import { memberLabel } from "./org-roster";
import { formatRelativeTime } from "./org-time";
import type { OrgTabProps } from "./organization-view";

/**
 * Organization > Agents: a grid of the agents the caller can see (owner: every
 * org agent; admin: the ones assigned to them — the agent list query already
 * reflects this). Each tile shows who manages the agent, how many people can
 * use it, and when it was last opened; clicking it drills into the agent's
 * admin detail (its stacked access controls, `onOpenAgent`) — staying inside
 * Admin rather than leaving for the agent chat. Fresh orgs get a "create your
 * first agent" empty state.
 *
 * The pinned AI model is intentionally omitted: it lives in each agent's config
 * file, not on the agent-list row, so surfacing it would cost one config fetch
 * per tile. We show managers + access + last-opened, which the list already
 * carries. Last-opened is the caller's own `lastOpenedAt`.
 */
export default function AgentsTab({
  ctx,
  onOpenAgent,
}: OrgTabProps & { onOpenAgent: (agent: Agent) => void }) {
  const { t, i18n } = useTranslation("teams");
  const agents = useAgentStore((s) => s.agents);
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );
  const members = ctx.org.members;

  if (agents.length === 0) {
    return (
      <Empty className="mt-6">
        <EmptyTitle>{t("agentsTab.empty.title")}</EmptyTitle>
        <EmptyDescription>{t("agentsTab.empty.body")}</EmptyDescription>
        <EmptyContent>
          <Button
            className="rounded-full"
            onClick={() => setCreateAgentDialogOpen(true)}
          >
            {t("agentsTab.empty.action")}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => {
        const summary = summarizeAgentAccess(agent);
        const managedBy =
          summary.managerIds.length > 0
            ? t("agentsTab.managedBy", {
                names: summary.managerIds
                  .map((id) => memberLabel(id, members))
                  .join(", "),
              })
            : null;
        const access = summary.everyone
          ? t("agentsTab.access.everyone")
          : summary.peopleCount !== null
            ? t("agentsTab.access.people", { count: summary.peopleCount })
            : t("agentsTab.access.you");
        const lastOpened = agent.lastOpenedAt
          ? t("agentsTab.lastOpened", {
              time: formatRelativeTime(
                Date.parse(agent.lastOpenedAt),
                i18n.language,
              ),
            })
          : null;

        return (
          <OrgAgentCard
            key={agent.id}
            name={agent.name}
            color={resolveAgentColor(agent.color)}
            managedBy={managedBy}
            access={access}
            lastOpened={lastOpened}
            openLabel={t("agentsTab.open", { name: agent.name })}
            onOpen={() => onOpenAgent(agent)}
          />
        );
      })}
    </div>
  );
}
