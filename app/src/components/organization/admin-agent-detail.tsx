import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { DEFAULT_TAB_ID } from "../../agents/standard-tabs";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AgentAccessSection } from "../tabs/agent-access-section";
import { AgentAdminIntegrations } from "../tabs/agent-admin/agent-admin-integrations";
import { AgentAdminModel } from "../tabs/agent-admin/agent-admin-model";

/**
 * Admin > Agents fleet drill-in: an org owner/admin manages ONE agent's access
 * controls without leaving the Admin surface. It reuses the very sections the
 * per-agent Agent Settings tab uses — people-with-access, allowed apps, allowed
 * models — each self-loading and Teams-gated internally.
 *
 * The manager-authority gate lives HERE, in the parent, because those sections
 * do NOT self-gate on it (Agent Settings hardcodes them editable and relies on
 * the tab mount to gate). {@link isAgentManager}: owner → any org agent; admin →
 * only agents where their effective `access === "manager"`. A visible-but-not-
 * manager admin (assigned as a plain user) gets the access section (which
 * self-shapes to its read-only view) plus a note — never the editable
 * apps/models editors.
 *
 * The `agent` is resolved live from the store by the shell (by id, not a
 * snapshot), so a share mutation that reloads the store shows fresh assignments
 * here immediately.
 */
export function AdminAgentDetail({ agent }: { agent: Agent }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const canManage = isAgentManager(capabilities, agent);

  // The old card behavior: leave Admin and open the agent's chat.
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

      {/* Each section renders its own heading ("Share this agent", "Which apps
          can this agent use?", "Which AI models can this agent use?"), so the
          stack adds spacing only — no block headings, to avoid double-heading. */}
      {canManage ? (
        <div className="space-y-8">
          <AgentAccessSection agent={agent} />
          <AgentAdminIntegrations agent={agent} />
          <AgentAdminModel agent={agent} />
        </div>
      ) : (
        <div className="space-y-4">
          <AgentAccessSection agent={agent} />
          <p className="text-sm text-ink-muted">
            {t("org.agentDetail.managerOnly")}
          </p>
        </div>
      )}
    </PageContainer>
  );
}
