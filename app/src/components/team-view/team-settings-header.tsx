import { Button, useIsMobile } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { teamDisplayName } from "../../lib/team-display";
import type { TeamSectionId, TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { MobileDrilledHeader } from "../shell/mobile-drilled-header";
import { DrilledHeader } from "../shell/page-header/drilled-header";
import { TeamGlyph } from "../shell/team-glyph";

const IDS = ["context", "agents", "people", "settings"] as const;
type TeamSettingsSection = (typeof IDS)[number];

const MOBILE_TITLE_KEYS = {
  context: "teamView.settingsTabs.context",
  agents: "teamView.settingsTabs.agents",
  people: "teamView.settingsTabs.people",
  settings: "teamView.settingsTabs.settings",
} as const satisfies Record<TeamSettingsSection, string>;

export function TeamSettingsHeader(props: {
  team: TeamView;
  sections: readonly TeamSectionId[];
  active: TeamSectionId;
  canCreateAgent: boolean;
}) {
  const { t } = useTranslation(["teams", "shell"]);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const openTeamsHome = useUIStore((s) => s.openTeamsHome);
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );
  const isMobile = useIsMobile();
  const teamName = teamDisplayName(props.team, t("teamView.defaultName"));
  // On the phone this level was entered from the Teams tree, one row per
  // settings section, so it retreats to the tree rather than to the team's
  // board: back must undo the tap the user actually made.
  if (isMobile) {
    const active = IDS.find((id) => id === props.active) ?? "context";
    return (
      <MobileDrilledHeader
        backLabel={t("shell:teamsHome.title")}
        onBack={() => openTeamsHome({ nav: "retreat" })}
        glyph={<TeamGlyph team={props.team} className="size-5 shrink-0" />}
        title={teamName}
        subtitle={t(MOBILE_TITLE_KEYS[active])}
        testId="team-settings-mobile-back"
      />
    );
  }
  const items = IDS.filter((id) => props.sections.includes(id)).map((id) => ({
    id,
    heading: id === "context",
    label: t(`teamView.settingsTabs.${id}`),
    dataAttrs: { "data-team-settings-tab": id },
  }));
  return (
    <DrilledHeader<TeamSettingsSection>
      backLabel={teamName}
      backIcon={<TeamGlyph team={props.team} className="size-4" />}
      backDataAttrs={{ "data-team-settings-back": "" }}
      items={items}
      active={props.active as TeamSettingsSection}
      label={t("teamView.settingsTabs.label")}
      switcherDataAttrs={{ "data-team-settings-switcher": "" }}
      tools={
        props.active === "agents" && props.canCreateAgent ? (
          <Button
            size="sm"
            onClick={() => setCreateAgentDialogOpen(true, props.team.id)}
          >
            <Plus className="size-4" />
            {t("agentTeams.create.newAgent")}
          </Button>
        ) : undefined
      }
      onSelect={(section) =>
        openTeamView(props.team.id, section, { teamSettingsFocus: true })
      }
      onBack={() => openTeamView(props.team.id, "mission-control")}
    />
  );
}
