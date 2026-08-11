import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { TeamSectionId, TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { PageHeader } from "../shell/page-header/page-header";
import { headerCollapsesTabs } from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { usePageHeaderMode } from "../shell/page-header/page-header-tools";

const LABEL_KEYS = {
  routines: "teamView.tabs.routines",
  files: "teamView.tabs.files",
  settings: "teamView.agentTabs.settings",
} as const;

export function AgentChrome({
  team,
  agent,
  sections,
  section,
}: {
  team: TeamView;
  agent: Agent;
  sections: readonly TeamSectionId[];
  section: TeamSectionId;
}) {
  const { t } = useTranslation("teams");
  const collapsed = headerCollapsesTabs(usePageHeaderMode());
  const openTeamView = useUIStore((state) => state.openTeamView);
  const identity = (
    <>
      <HoustonAvatar color={resolveAgentColor(agent.color)} diameter={20} />
      <span className="min-w-0 truncate">{agent.name}</span>
    </>
  );
  const labelled = sections
    .filter((id): id is keyof typeof LABEL_KEYS => id in LABEL_KEYS)
    .map((id) => ({ id, label: t(LABEL_KEYS[id]) }));
  const attrs = (id: TeamSectionId) => ({ "data-team-section-tab": id });
  const select = (next: TeamSectionId) =>
    openTeamView(team.id, next, {
      agentFilter: agent.id,
      agentFocus: true,
    });
  const items = [
    {
      id: "mission-control" as const,
      heading: true,
      label: identity,
      dataAttrs: attrs("mission-control"),
    },
    ...labelled.map((item) => ({ ...item, dataAttrs: attrs(item.id) })),
  ];

  return (
    <div data-agent-screen="">
      <PageHeader>
        {collapsed ? (
          <PageHeaderSwitcher
            identity={identity}
            items={items.map(({ id, label, dataAttrs }) => ({
              id,
              label:
                id === "mission-control"
                  ? t("teamView.tabs.missionControl")
                  : label,
              dataAttrs,
            }))}
            active={section}
            label={t("teamView.tabs.label")}
            onSelect={select}
            dataAttrs={{ "data-team-section-switcher": "" }}
          />
        ) : (
          <PageHeaderTabs
            items={items}
            active={section}
            label={t("teamView.tabs.label")}
            onSelect={select}
          />
        )}
      </PageHeader>
    </div>
  );
}
