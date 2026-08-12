import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import {
  type AgentSettingsSection,
  SECTION_TITLES,
} from "../agent-settings/agent-settings-nav.ts";
import { DrilledHeader } from "../shell/page-header/drilled-header";

export function AgentDetailHeader({
  agent,
  backLabel,
  sections,
  active,
  onSelect,
  onBack,
}: {
  agent: Agent;
  backLabel?: string;
  sections: readonly AgentSettingsSection[];
  active: AgentSettingsSection;
  onSelect: (section: AgentSettingsSection) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(["teams", "agents"]);
  // The BACK CHIP carries the agent's identity (avatar + name), so the first
  // lozenge is a plain "Job description" tab. It keeps the heading: the
  // drilled level's first lens carries the h1, exactly as Admin's does.
  const items = sections.map((id) => ({
    id,
    heading: id === "job-description",
    label: t(SECTION_TITLES[id]),
    dataAttrs: { "data-agent-section-tab": id },
  }));
  return (
    <DrilledHeader
      backLabel={backLabel ?? agent.name}
      backIcon={
        <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={16} />
      }
      backDataAttrs={{ "data-agent-settings-back": "" }}
      items={items}
      active={active}
      label={t("agentSettings.railLabel")}
      switcherDataAttrs={{ "data-agent-section-switcher": "" }}
      onSelect={onSelect}
      onBack={onBack}
    />
  );
}
