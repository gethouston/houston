import { Button } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TeamSectionId, TeamView } from "../../lib/teams-model";
import { useUIStore } from "../../stores/ui";
import { DrilledHeader } from "../shell/page-header/drilled-header";
import { TeamGlyph } from "../shell/team-glyph";

const IDS = ["context", "agents", "people", "settings"] as const;
type TeamSettingsSection = (typeof IDS)[number];

export function TeamSettingsHeader(props: {
  team: TeamView;
  sections: readonly TeamSectionId[];
  active: TeamSectionId;
  canCreateAgent: boolean;
}) {
  const { t } = useTranslation("teams");
  const openTeamView = useUIStore((s) => s.openTeamView);
  const setCreateAgentDialogOpen = useUIStore(
    (s) => s.setCreateAgentDialogOpen,
  );
  const items = IDS.filter((id) => props.sections.includes(id)).map((id) => ({
    id,
    heading: id === "context",
    label: t(`teamView.settingsTabs.${id}`),
    dataAttrs: { "data-team-settings-tab": id },
  }));
  return (
    <DrilledHeader<TeamSettingsSection>
      backLabel={props.team.name}
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
