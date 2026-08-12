import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import type { Agent } from "../../lib/types";
import type { AgentSettingsSection } from "../agent-settings/agent-settings-nav.ts";
import { agentSettingsSections } from "../agent-settings/agent-settings-nav.ts";
import { AgentSettingsPage } from "../agent-settings/agent-settings-page";
import {
  advanceAgentSettingsSelection,
  resolveAgentSettingsSection,
} from "../agent-settings/agent-settings-selection.ts";
import { PageContainer } from "../shell/page-shell";
import { AgentDetailHeader } from "./agent-detail-header";

/**
 * Permissions agent detail: an org owner/admin opens ONE agent on the canonical
 * {@link AgentSettingsPage} — its Context (job description, learnings) and its
 * Permissions (people, apps, AI models, skills) in one master-detail surface.
 * The whole product is agent-centric: pick an agent, then manage who reaches it
 * and what it may reach.
 *
 * Configuring an agent is a MANAGER's job and the page has one door — the
 * agent's own Settings section, which only its managers are offered
 * (`visibleAgentSections`). So everyone standing here manages this agent, and
 * every section renders its editable face. The gateway is the real enforcer.
 *
 * The `agent` is resolved live from the store by the shell (by id, not a
 * snapshot), so a share mutation that reloads the store shows fresh data here.
 *
 * The agent's Share affordance lives in the People section (it is the invite
 * door), so this shell carries navigation and the body registry, nothing else.
 */
export function AgentDetail({
  agent,
  backLabel,
  onBack,
  initialSection,
  onSectionShown,
}: {
  agent: Agent;
  backLabel?: string;
  onBack: () => void;
  /** Section to open on first mount (a deep link may land on Apps). */
  initialSection?: AgentSettingsSection;
  /** The section actually on screen, for the caller's analytics. */
  onSectionShown?: (section: AgentSettingsSection) => void;
}) {
  const { capabilities } = useCapabilities();
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

  return (
    <div className="flex h-full flex-col">
      <AgentDetailHeader
        agent={agent}
        backLabel={backLabel}
        sections={sections}
        active={selected}
        onSelect={select}
        onBack={onBack}
      />
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <PageContainer
          // Job description's pinned card takes the column's full height (the
          // outer scroller stays as a short-window fallback, like About me);
          // every other section page-scrolls with its usual bottom padding.
          className={
            selected === "job-description"
              ? "flex h-full min-h-0 flex-col pt-6"
              : "pt-6 pb-10"
          }
        >
          <AgentSettingsPage agent={agent} section={selected} />
        </PageContainer>
      </div>
    </div>
  );
}
