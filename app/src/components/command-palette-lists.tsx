/**
 * The command palette's "jump to a thing" groups: teams, agents, recent
 * missions. Split out of `command-palette.tsx`, which keeps the dialog, the
 * data it reads and the actions; these are pure lists over what it hands them.
 *
 * Each group renders NOTHING when it is empty (its separator included), so the
 * palette never shows a heading over no rows.
 */

import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RawConversation } from "../lib/tauri";
import { teamDisplayName } from "../lib/team-display";
import type { TeamView } from "../lib/teams-model";
import type { Agent } from "../lib/types";
import { missionCardAgentName } from "./board/mission-card-agent";

// 28px outer circle so the inner helmet (forced to 20px by cmdk's
// `[&_[cmdk-item]_svg]:h-5` rule) sits at roughly its native 65%
// proportion instead of overflowing the badge.
const AVATAR_PX = 28;

function PaletteAvatar({ color }: { color?: string }) {
  return (
    <HoustonAvatar color={resolveAgentColor(color)} diameter={AVATAR_PX} />
  );
}

/**
 * The teams, each opening its Mission Control. Every mission board belongs to
 * a team now, so this group is how the palette reaches a board at all.
 */
export function PaletteTeams({
  teams,
  onSelect,
}: {
  teams: TeamView[];
  onSelect: (teamId: string) => void;
}) {
  const { t } = useTranslation(["shell", "teams"]);
  if (teams.length === 0) return null;
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading={t("palette.groups.teams")}>
        {teams.map((team) => {
          const name = teamDisplayName(team, t("teams:teamView.defaultName"));
          return (
            <CommandItem
              key={team.id}
              value={`team ${name}`}
              onSelect={() => onSelect(team.id)}
            >
              <Users />
              <span>{name}</span>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}

export function PaletteAgents({
  agents,
  onSelect,
}: {
  agents: Agent[];
  onSelect: (agentId: string) => void;
}) {
  const { t } = useTranslation("shell");
  if (agents.length === 0) return null;
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading={t("palette.groups.agents")}>
        {agents.map((agent) => (
          <CommandItem
            key={agent.id}
            value={`agent ${agent.name}`}
            onSelect={() => onSelect(agent.id)}
          >
            <PaletteAvatar color={agent.color} />
            <span>{agent.name}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}

export function PaletteMissions({
  missions,
  colorByPath,
  agentsByPath,
  onSelect,
}: {
  missions: RawConversation[];
  colorByPath: Record<string, string | undefined>;
  agentsByPath: Map<string, Agent>;
  onSelect: (agentPath: string, missionId: string) => void;
}) {
  const { t } = useTranslation("shell");
  if (missions.length === 0) return null;
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading={t("palette.groups.recentMissions")}>
        {missions.map((m) => {
          const agentName = missionCardAgentName(
            agentsByPath,
            m.agent_path,
            m.agent_name,
          );
          return (
            <CommandItem
              key={m.id}
              value={`mission ${m.title} ${agentName ?? ""}`}
              onSelect={() => onSelect(m.agent_path, m.id)}
            >
              <PaletteAvatar color={colorByPath[m.agent_path]} />
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{m.title}</span>
                <span className="truncate text-xs text-ink-muted">
                  {agentName}
                </span>
              </div>
            </CommandItem>
          );
        })}
      </CommandGroup>
    </>
  );
}
