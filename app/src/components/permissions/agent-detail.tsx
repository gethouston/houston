import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { DEFAULT_TAB_ID } from "../../agents/standard-tabs";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AgentAdminIntegrations } from "../tabs/agent-admin/agent-admin-integrations";
import { AgentAdminModel } from "../tabs/agent-admin/agent-admin-model";

/**
 * Permissions > Agents per-agent card: an org owner/admin sets what ONE agent is
 * allowed to use — its integration ceiling and its model ceiling. WHO can use
 * the agent is the People tab's job, so this card carries no roster (unlike the
 * old Admin drill-in it was extracted from).
 *
 * The manager-authority gate lives HERE, in the parent, because the sections do
 * NOT self-gate on it (Agent Settings hardcodes them editable and relies on the
 * tab mount to gate). {@link isAgentManager}: owner → any org agent; admin →
 * only agents where their effective `access === "manager"`. A visible-but-not-
 * manager admin gets a manager-only note instead of the editors.
 *
 * The `agent` is resolved live from the store by the shell (by id, not a
 * snapshot), so a share mutation that reloads the store shows fresh data here.
 */
export function AgentDetail({ agent }: { agent: Agent }) {
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

      {/* Each section renders its own heading ("Which apps can this agent
          use?", "Which AI models can this agent use?"), so the stack adds
          spacing only — no block headings, to avoid double-heading. */}
      {canManage ? (
        <div className="space-y-8">
          <AgentAdminIntegrations agent={agent} />
          <AgentAdminModel agent={agent} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">
          {t("org.agentDetail.managerOnly")}
        </p>
      )}
    </PageContainer>
  );
}
