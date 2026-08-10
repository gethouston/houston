import { Button } from "@houston-ai/core";
import { UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
import { isAgentManager } from "../../lib/agent-access";
import { openAgentBoard } from "../../lib/open-agent";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { agentShareSurface } from "../agent/agent-access-model";
import { AgentShareSurfaces } from "../agent/agent-share-surfaces";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";
import { agentSettingsSections } from "../agent-settings/agent-settings-nav.ts";
import { AgentSettingsPage } from "../agent-settings/agent-settings-page";
import {
  advanceAgentSettingsSelection,
  resolveAgentSettingsSection,
} from "../agent-settings/agent-settings-selection.ts";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { PageContainer } from "../shell/page-shell";
import { AgentDetailHeader } from "./agent-detail-header";

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
  teamName,
  onBack,
  initialSection,
  onSectionShown,
}: {
  agent: Agent;
  teamName: string;
  onBack: () => void;
  /** Section to open on first mount (a deep link may land on Apps). */
  initialSection?: AgentSettingsSection;
  /** The section actually on screen, for the caller's analytics. */
  onSectionShown?: (section: AgentSettingsSection) => void;
}) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const canManage = isAgentManager(capabilities, agent);
  const personalSpace = usePersonalSpace();
  const [shareOpen, setShareOpen] = useState(false);
  // The ONE reading of "am I in a personal space", shared with the rail and the
  // Members card, rather than a second inline derivation off the workspace id.
  const shareSurface = agentShareSurface(capabilities, agent, personalSpace);
  const sections = useMemo(
    () => agentSettingsSections(capabilities),
    [capabilities],
  );
  const [selected, setSelected] = useState<AgentSettingsSection>(() =>
    resolveAgentSettingsSection(sections, initialSection),
  );
  const pendingRef = useRef<AgentSettingsSection | undefined>(initialSection);
  const requestRef = useRef({ agentId: agent.id, section: initialSection });
  const selectedRef = useRef(selected);
  const select = useCallback((section: AgentSettingsSection) => {
    selectedRef.current = section;
    setSelected(section);
  }, []);

  useEffect(() => {
    const request = requestRef.current;
    if (request.agentId !== agent.id || request.section !== initialSection) {
      requestRef.current = { agentId: agent.id, section: initialSection };
      pendingRef.current = initialSection;
    }
    const next = advanceAgentSettingsSelection({
      sections,
      pending: pendingRef.current,
      current: selectedRef.current,
    });
    pendingRef.current = next.pending;
    if (next.selected !== selectedRef.current) select(next.selected);
  }, [agent.id, initialSection, sections, select]);

  useEffect(() => onSectionShown?.(selected), [selected, onSectionShown]);

  // Leave the settings page and go where the agent WORKS: its team's Mission
  // Control, filtered to this agent.
  const openAgent = () => {
    setCurrentAgent(agent);
    openAgentBoard(agent.id);
  };

  return (
    <div className="flex h-full flex-col">
      <AgentDetailHeader
        agent={agent}
        teamName={teamName}
        sections={sections}
        active={selected}
        onSelect={select}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <PageContainer className="pt-6 pb-10">
          <PageHeaderTools>
            {() => (
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
            )}
          </PageHeaderTools>
          <AgentSettingsPage
            agent={agent}
            section={selected}
            readOnly={!canManage}
          />
        </PageContainer>
      </div>
      <AgentShareSurfaces
        agent={agent}
        surface={shareSurface}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}
