import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { PermissionsAgentGrid } from "./agent-grid";

/**
 * The Permissions plane: the agents the caller can see (owner: every org
 * agent; admin: the ones assigned to them — the agent list query already
 * reflects this), as flat rows in the app's page language. Each row carries
 * ONE plain-language summary line — who can use the agent, who manages it —
 * and opens that agent's permission card (People | Integrations | AI Models).
 * Fresh orgs get a "create your first agent" empty state.
 *
 * The populated list is {@link PermissionsAgentGrid}, shared with a team's
 * settings; this view owns only the workspace-level empty state.
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
    <PermissionsAgentGrid
      agents={agents}
      members={members}
      onOpenAgent={onOpenAgent}
    />
  );
}
