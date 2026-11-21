import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCapabilities } from "../../hooks/use-capabilities";
import { usePersonalSpace } from "../../hooks/use-personal-space";
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
  initialSection?: AgentSettingsSection;
  onSectionShown?: (section: AgentSettingsSection) => void;
}) {
  const { capabilities } = useCapabilities();
  const personalSpace = usePersonalSpace();
  const sections = useMemo(
    () => agentSettingsSections(capabilities, personalSpace),
    [capabilities, personalSpace],
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
