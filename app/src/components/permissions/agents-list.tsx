import {
  Button,
  CatalogSectionHeader,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
  resolveAgentColor,
} from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { memberLabel } from "../organization/org-roster";
import { PermissionsAgentRow } from "./agent-row";
import { summarizeAgentAccess } from "./org-agents-model";

/**
 * The Permissions plane: the agents the caller can see (owner: every org
 * agent; admin: the ones assigned to them — the agent list query already
 * reflects this), as flat rows in the app's page language. Each row carries
 * ONE plain-language summary line — who can use the agent, who manages it —
 * and opens that agent's permission card (People | Integrations | AI Models).
 * Fresh orgs get a "create your first agent" empty state.
 *
 * Deliberately NOT here: last-opened (dashboard information, not permission
 * information) and the pinned model (one config fetch per row).
 */
export function AgentsList({
  members,
  onOpenAgent,
}: {
  members: OrgMember[];
  onOpenAgent: (agent: Agent) => void;
}) {
  const { t } = useTranslation("teams");
  const agents = useAgentStore((s) => s.agents);
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );

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
    <section>
      <CatalogSectionHeader
        title={t("permissions.agentsHeading")}
        count={agents.length}
        className="mb-2"
      />
      <div className="grid grid-cols-1 gap-1 lg:grid-cols-2">
        {agents.map((agent) => {
          const summary = summarizeAgentAccess(agent);
          const access = summary.everyone
            ? t("agentsTab.access.everyone")
            : summary.peopleCount !== null
              ? t("agentsTab.access.people", { count: summary.peopleCount })
              : t("agentsTab.access.you");
          const managedBy =
            summary.managerIds.length > 0
              ? t("agentsTab.managedBy", {
                  names: summary.managerIds
                    .map((id) => memberLabel(id, members))
                    .join(", "),
                })
              : null;
          return (
            <PermissionsAgentRow
              key={agent.id}
              name={agent.name}
              color={resolveAgentColor(agent.color)}
              summary={managedBy ? `${access} · ${managedBy}` : access}
              openLabel={t("agentsTab.open", { name: agent.name })}
              onOpen={() => onOpenAgent(agent)}
            />
          );
        })}
      </div>
    </section>
  );
}
