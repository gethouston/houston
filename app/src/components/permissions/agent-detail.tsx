import { Button, HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { isAgentManager } from "../../lib/agent-access";
import { openAgentBoard } from "../../lib/open-agent";
import { isTeamWorkspace } from "../../lib/space-id";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { agentShareSurface } from "../agent/agent-access-model";
import { AgentShareSurfaces } from "../agent/agent-share-surfaces";
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
 * agent but doesn't manage it gets the page `readOnly` — every section renders
 * its non-manager face — rather than a dead-end note. {@link isAgentManager}: owner → any org agent; admin → only
 * agents where their effective `access === "manager"`. The gateway is the real
 * enforcer either way.
 *
 * The `agent` is resolved live from the store by the shell (by id, not a
 * snapshot), so a share mutation that reloads the store shows fresh data here.
 *
 * It also carries the agent's ONE Share affordance. That used to hang off the
 * per-agent header, which no longer exists; this page is where an agent is
 * addressed now, so the same {@link AgentShareSurfaces} wiring lives here —
 * the manage dialog in a team space, the read-only "who has access" list for a
 * member, and, in a PERSONAL space on a spaces host, the share-via-team flow
 * that moves the agent into a team (personal spaces cannot be invited into, so
 * that pipeline has no other door).
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
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const canManage = isAgentManager(capabilities, agent);
  const [shareOpen, setShareOpen] = useState(false);
  const shareSurface = agentShareSurface(
    capabilities,
    agent,
    !isTeamWorkspace(currentWorkspace?.id ?? ""),
  );

  // Leave the settings page and go where the agent WORKS: its team's Mission
  // Control, filtered to this agent.
  const openAgent = () => {
    setCurrentAgent(agent);
    openAgentBoard(agent.id);
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
            <div className="flex items-center gap-2">
              {shareSurface !== "none" && (
                <Button
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => setShareOpen(true)}
                >
                  <UserPlus className="size-4" />
                  {shareSurface === "view"
                    ? t("share.viewButton")
                    : t("share.button")}
                </Button>
              )}
              <Button
                variant="secondary"
                className="rounded-full"
                onClick={openAgent}
              >
                {t("org.agentDetail.openAgent")}
              </Button>
            </div>
          }
        />
      </div>

      <AgentSettingsPage
        agent={agent}
        initialSection={initialSection}
        readOnly={!canManage}
        onSectionShown={onSectionShown}
      />
      <AgentShareSurfaces
        agent={agent}
        surface={shareSurface}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </PageContainer>
  );
}
