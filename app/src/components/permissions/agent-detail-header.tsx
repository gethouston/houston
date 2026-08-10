import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import {
  type AgentSettingsSection,
  SECTION_TITLES,
} from "../agent-settings/agent-settings-nav.ts";
import { PageHeader } from "../shell/page-header/page-header";
import { PageHeaderBackChip } from "../shell/page-header/page-header-back-chip";
import { headerCollapsesTabs } from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { usePageHeaderMode } from "../shell/page-header/page-header-tools";

export function AgentDetailHeader({
  agent,
  teamName,
  sections,
  active,
  onSelect,
  onBack,
}: {
  agent: Agent;
  teamName: string;
  sections: readonly AgentSettingsSection[];
  active: AgentSettingsSection;
  onSelect: (section: AgentSettingsSection) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation(["teams", "agents"]);
  const collapsed = headerCollapsesTabs(usePageHeaderMode());
  const identity = (
    <>
      <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={20} />
      <span className="min-w-0 truncate">{agent.name}</span>
    </>
  );
  // The agent IS the first lozenge, the way the team's lozenge stands for its
  // board: identity and Job description are one tab, so the cluster opens on
  // who this is and what they do in a single door.
  const items = sections.map((id) => ({
    id,
    heading: id === "job-description",
    label: id === "job-description" ? identity : t(SECTION_TITLES[id]),
    dataAttrs: { "data-agent-section-tab": id },
  }));
  const switcherItems = sections.map((id) => ({
    id,
    label: t(SECTION_TITLES[id]),
    dataAttrs: { "data-agent-section-tab": id },
  }));

  return (
    <PageHeader>
      <div className="flex min-w-0 items-center gap-2">
        <PageHeaderBackChip
          label={t("teamView.manage.identity", { name: teamName })}
          icon={<Settings aria-hidden className="size-4 shrink-0" />}
          onClick={onBack}
          dataAttrs={{ "data-agent-settings-back": "" }}
        />
        {collapsed ? (
          <PageHeaderSwitcher
            identity={identity}
            items={switcherItems}
            active={active}
            label={t("agentSettings.railLabel")}
            onSelect={onSelect}
            dataAttrs={{ "data-agent-section-switcher": "" }}
          />
        ) : (
          <PageHeaderTabs
            items={items}
            active={active}
            label={t("agentSettings.railLabel")}
            onSelect={onSelect}
          />
        )}
      </div>
    </PageHeader>
  );
}
