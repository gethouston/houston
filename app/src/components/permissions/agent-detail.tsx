import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { DEFAULT_TAB_ID } from "../../agents/standard-tabs";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AgentPermissionsPanel } from "./agent-permissions-panel";
import type { PermissionsAgentTab } from "./permissions-nav-store";

/**
 * Permissions agent detail: an org owner/admin manages ONE agent across three
 * tabs — **People** (who can use it, at what level), **Integrations** (its app
 * ceiling), and **AI Models** (its model ceiling). The whole product is agent-
 * centric: pick an agent, then manage who reaches it and what it may reach.
 *
 * The manager-authority gate lives HERE, in the parent: the top-level drill-in is
 * owner/admin-only, and a visible-but-not-manager admin gets a manager-only note
 * instead of the editable panel. {@link isAgentManager}: owner → any org agent;
 * admin → only agents where their effective `access === "manager"`. (The agent's
 * OWN Permissions tab reuses the same {@link AgentPermissionsPanel} but shows it
 * read-only to non-managers rather than hiding it — see `agent-permissions-tab`.)
 *
 * The `agent` is resolved live from the store by the shell (by id, not a
 * snapshot), so a share mutation that reloads the store shows fresh data here.
 */
export function AgentDetail({
  agent,
  members,
  initialTab = "people",
}: {
  agent: Agent;
  members: OrgMember[];
  /** Tab to open on first mount (a deep link may land on Integrations). */
  initialTab?: PermissionsAgentTab;
}) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const canManage = isAgentManager(capabilities, agent);

  // The old card behavior: leave Permissions and open the agent's chat.
  const openAgent = () => {
    setCurrentAgent(agent);
    setViewMode(DEFAULT_TAB_ID);
  };

  return (
    <PageContainer className="pt-2 pb-10">
      <div className="mb-8 flex items-start gap-3">
        <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={40} />
        <PageHeader
          className="flex-1"
          title={agent.name}
          subtitle={t("org.agentDetail.subtitle")}
          trailing={
            <Button
              variant="secondary"
              className="rounded-full"
              onClick={openAgent}
            >
              {t("org.agentDetail.openAgent")}
            </Button>
          }
        />
      </div>

      {canManage ? (
        <AgentPermissionsPanel
          agent={agent}
          members={members}
          initialTab={initialTab}
          readOnly={false}
        />
      ) : (
        <p className="text-sm text-ink-muted">
          {t("org.agentDetail.managerOnly")}
        </p>
      )}
    </PageContainer>
  );
}
