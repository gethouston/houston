import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
  HoustonAvatar,
  resolveAgentColor,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import type { RawConversation } from "../lib/conversations-facade";
import type { Agent } from "../lib/types";
import { missionCardAgentName } from "./board/mission-card-agent";

const AVATAR_PX = 28;

function PaletteAvatar({ color }: { color?: string }) {
  return (
    <HoustonAvatar color={resolveAgentColor(color)} diameter={AVATAR_PX} />
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
