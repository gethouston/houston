import {
  HoustonAvatar,
  resolveAgentColor,
  useIsMobile,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { TeamSectionId } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { MobileDrilledHeader } from "../shell/mobile-drilled-header";
import { PageHeader } from "../shell/page-header/page-header";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { openPhoneTaskList } from "./open-phone-task-list";

const LABEL_KEYS = {
  routines: "teamView.tabs.routines",
  files: "teamView.tabs.files",
  settings: "teamView.agentTabs.settings",
} as const;

/**
 * The board has no lozenge label in the strip (the identity stands for it) but
 * a phone title needs the word. Exhaustive over `TeamSectionId` so a new
 * section is a compile error rather than a blank subtitle, even though a
 * focused agent only ever stands on four of them.
 */
const MOBILE_TITLE_KEYS = {
  "mission-control": "teamView.tabs.missionControl",
  routines: "teamView.tabs.routines",
  files: "teamView.tabs.files",
  settings: "teamView.agentTabs.settings",
} as const satisfies Record<TeamSectionId, string>;

export function AgentChrome({
  agent,
  sections,
  section,
}: {
  agent: Agent;
  sections: readonly TeamSectionId[];
  section: TeamSectionId;
}) {
  const { t } = useTranslation("teams");
  const openAgentView = useUIStore((state) => state.openAgentView);
  const isMobile = useIsMobile();
  if (isMobile) {
    // The phone has ONE task list per employee, the AI Employees drill-in, so
    // Tasks and back both return there. Tabs replace rather than push: back
    // leaves the employee's screen instead of replaying every tab tapped.
    const openTaskList = () => openPhoneTaskList(agent.id);
    const selectPhone = (next: TeamSectionId) =>
      next === "mission-control"
        ? openTaskList()
        : openAgentView(agent.id, next, { nav: "replace" });
    return (
      <div data-agent-screen="">
        <MobileDrilledHeader
          backLabel={agent.name}
          onBack={openTaskList}
          glyph={
            <HoustonAvatar
              color={resolveAgentColor(agent.color)}
              diameter={24}
            />
          }
          title={agent.name}
          subtitle={t(MOBILE_TITLE_KEYS[section])}
          testId="agent-mobile-back"
        />
        <div className="overflow-x-auto px-3 pb-2">
          <PageHeaderTabs
            items={sections.map((id) => ({
              id,
              label: t(MOBILE_TITLE_KEYS[id]),
              dataAttrs: { "data-team-section-tab": id },
            }))}
            active={section}
            label={t("teamView.tabs.label")}
            onSelect={selectPhone}
          />
        </div>
      </div>
    );
  }
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
  const select = (next: TeamSectionId) => openAgentView(agent.id, next);
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
        <PageHeaderTabs
          items={items}
          active={section}
          label={t("teamView.tabs.label")}
          onSelect={select}
        />
      </PageHeader>
    </div>
  );
}
