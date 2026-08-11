import { HoustonAvatar, resolveAgentColor } from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  teamHomeLozengeActive,
  teamHomeLozengeClick,
} from "../../lib/team-home-lozenge";
import {
  sectionHonorsAgentPin,
  type TeamSectionId,
  type TeamView,
  teamDisplayName,
} from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { PageHeader } from "../shell/page-header/page-header";
import { headerCollapsesTabs } from "../shell/page-header/page-header-layout";
import { PageHeaderSwitcher } from "../shell/page-header/page-header-switcher";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { usePageHeaderMode } from "../shell/page-header/page-header-tools";
import { TeamGlyph } from "../shell/team-glyph";
import { teamPinnedAgent } from "./team-agent-choice";
import { teamSectionTabs } from "./team-section-tabs-model";

/**
 * The team strip: WHERE you are, WHERE you can go, and — when the width is
 * there — what this section gives you to work with.
 *
 * **Wide, one row, two zones:**
 *
 *     (glyph Marketing › (helmet) Kai)(Routines)(Files)(Archived)(focused agent screen)      [search][Everyone ▾][New task]
 *      \\_________________________ left cluster _________________________/             \\________ right, the section's ________/
 *
 * **The team IS the first lozenge.** There is no separate breadcrumb and no
 * "Tasks" label anywhere: the board is not a section beside the team, it is
 * what the team looks like when you are on it. So the team's glyph and name
 * wear the same lozenge geometry as its sections, take the same active state
 * (`teamHomeLozengeActive`), and carry the screen's `<h1>`. A pinned agent
 * grows a second segment inside that lozenge — chevron, helmet, name — and the
 * lozenge simply gets wider, the way a Safari tab does.
 *
 * Its click has three arms and they are the RAIL's arms, one grammar on two
 * surfaces (`lib/team-home-lozenge.ts`): elsewhere in the team it opens the
 * board with the pin riding along; on a narrowed board it clears the pin; on
 * the whole team's board it does nothing.
 *
 * The second segment appears only where the pin actually narrows what is on
 * screen (`sectionHonorsAgentPin`): the board. Files starts at every agent,
 * while the other sections carry their own scope or list the whole team, so
 * the lozenge is the team alone — showing a segment there would claim a
 * narrowing the user never set, and offer to clear a pin nothing is using.
 *
 * **Narrow:** the cluster first collapses into the identity lozenge. Only below
 * `TEAM_STRIP_COMPACT_MIN` do the tools take their own row. Both thresholds are
 * measured in `team-chrome-layout.ts`, so neither form is squeezed into space
 * it does not honestly have.
 */
export function TeamChrome({
  team,
  sections,
  section,
}: {
  team: TeamView;
  /** `visibleTeamSectionsForTeam(caps, team)` -- the cluster IS that list. */
  sections: readonly TeamSectionId[];
  /** The section actually on screen (`resolveTeamSection`). */
  section: TeamSectionId;
}) {
  const { t } = useTranslation("teams");
  const mode = usePageHeaderMode();
  const collapsed = headerCollapsesTabs(mode);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const teamAgentFilter = useUIStore((s) => s.teamAgentFilter);
  const setTeamAgentFilter = useUIStore((s) => s.setTeamAgentFilter);

  // Through the RULE, never the store directly: the pin persists everywhere,
  // but the lozenge may only show it where the section is actually narrowed by
  // it. Files starts at every agent and focused agent screens the whole team, so
  // on both the lozenge is just the team.
  const pinnedAgent = sectionHonorsAgentPin(section)
    ? teamPinnedAgent(team.agents, teamAgentFilter)
    : null;

  const identity = (
    <>
      <TeamGlyph team={team} className="size-4 shrink-0" />
      <span className="min-w-0 truncate">
        {teamDisplayName(team, t("teamView.defaultName"))}
      </span>
      {pinnedAgent && (
        <>
          <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-60" />
          <HoustonAvatar
            color={resolveAgentColor(pinnedAgent.color)}
            diameter={16}
          />
          <span className="min-w-0 truncate">{pinnedAgent.name}</span>
        </>
      )}
    </>
  );

  const labelled = teamSectionTabs(sections).map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
  }));
  const tabs = [
    {
      id: "mission-control" as const,
      heading: true,
      label: identity,
      dataAttrs: { "data-team-section-tab": "mission-control" },
    },
    ...labelled.map((tab) => ({
      ...tab,
      dataAttrs: { "data-team-section-tab": tab.id },
    })),
  ];
  // The switcher MENU has to name the board, which the lozenge itself never
  // does: inside a list of section names, "the team's lozenge stands for it"
  // stops being legible.
  const switcherSections = [
    {
      id: "mission-control" as const,
      label: t("teamView.tabs.missionControl"),
      dataAttrs: { "data-team-section-tab": "mission-control" },
    },
    ...labelled.map((tab) => ({
      ...tab,
      dataAttrs: { "data-team-section-tab": tab.id },
    })),
  ];

  const select = (next: TeamSectionId) => {
    if (next === "settings") {
      openTeamView(team.id, "context", { teamSettingsFocus: true });
      return;
    }
    if (next !== "mission-control") {
      openTeamView(team.id, next, { agentFilter: teamAgentFilter });
      return;
    }
    const move = teamHomeLozengeClick({
      section,
      pinnedAgentId: teamAgentFilter,
    });
    if (move.kind === "open") {
      openTeamView(team.id, "mission-control", {
        agentFilter: teamAgentFilter,
      });
    } else if (move.kind === "clear-pin") {
      setTeamAgentFilter(null);
    }
  };

  return (
    <PageHeader>
      {collapsed ? (
        <PageHeaderSwitcher
          identity={identity}
          items={switcherSections}
          active={section}
          label={t("teamView.tabs.label")}
          onSelect={select}
          dataAttrs={{ "data-team-section-switcher": "" }}
        />
      ) : (
        <PageHeaderTabs
          items={tabs}
          active={teamHomeLozengeActive(section) ? "mission-control" : section}
          label={t("teamView.tabs.label")}
          onSelect={select}
        />
      )}
    </PageHeader>
  );
}
