import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { DEFAULT_TAB_ID } from "../../agents/standard-tabs";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";
import { AgentSettingsPage } from "../agent-settings/agent-settings-page";
import { PageContainer, PageHeader } from "../shell/page-shell";

/**
 * Permissions agent detail: an org owner/admin opens ONE agent on the canonical
 * {@link AgentSettingsPage} — its Context (job description, learnings) and its
 * Permissions (people, apps, AI models, skills) in one master-detail surface.
 * The whole product is agent-centric: pick an agent, then manage who reaches it
 * and what it may reach.
 *
 * Manager authority decides the FACE, not access: an admin who can see this
 * agent but doesn't manage it gets the page `readOnly` — the same read-only
 * sections they already have on the agent's own Admin tab — rather than a
 * dead-end note. {@link isAgentManager}: owner → any org agent; admin → only
 * agents where their effective `access === "manager"`. The gateway is the real
 * enforcer either way.
 *
 * The `agent` is resolved live from the store by the shell (by id, not a
 * snapshot), so a share mutation that reloads the store shows fresh data here.
 */
export function AgentDetail({
  agent,
  initialSection = "people",
  onSectionShown,
}: {
  agent: Agent;
  /** Section to open on first mount (a deep link may land on Apps). */
  initialSection?: AgentSettingsSection;
  /** The section actually on screen, for the caller's analytics. */
  onSectionShown?: (section: AgentSettingsSection) => void;
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
    <PageContainer className="pb-10">
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

      <AgentSettingsPage
        agent={agent}
        initialSection={initialSection}
        readOnly={!canManage}
        onSectionShown={onSectionShown}
      />
    </PageContainer>
  );
}
