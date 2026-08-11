import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
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
  const collapsed = headerCollapsesTabs(usePageHeaderMode());
  // The BACK CHIP carries the agent's identity (avatar + name), so the first
  // lozenge is a plain "Job description" tab. It keeps the heading: the
  // drilled level's first lens carries the h1, exactly as Admin's does.
  const items = sections.map((id) => ({
    id,
    heading: id === "job-description",
    label: t(SECTION_TITLES[id]),
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
          label={backLabel ?? agent.name}
          icon={
            <HoustonAvatar
              color={resolveAgentColor(agent.color)}
              diameter={16}
            />
          }
          onClick={onBack}
          dataAttrs={{ "data-agent-settings-back": "" }}
        />
        {collapsed ? (
          <PageHeaderSwitcher
            identity={
              <span className="min-w-0 truncate">
                {t(SECTION_TITLES[active])}
              </span>
            }
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
