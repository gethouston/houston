import type { AgentConfig } from "../../lib/types";
import { SkillCard } from "../skill-card";
import { AgentAvatar } from "./agent-avatar";

export {
  AgentAvatar,
  getAgentIcon,
  getAgentIconColor,
  getHoustonLogo,
  HoustonLogo,
  isLightColor,
} from "./agent-avatar";

interface AgentCardProps {
  config: AgentConfig;
  /** Localized display name (falls back to `config.name`). */
  title?: string;
  /** Localized display description (falls back to `config.description`). */
  description?: string;
  onSelect: (id: string) => void;
}

export function AgentCard({
  config,
  title,
  description,
  onSelect,
}: AgentCardProps) {
  return (
    <SkillCard
      image={config.image}
      media={
        config.image ? undefined : <AgentAvatar config={config} size="md" />
      }
      title={title ?? config.name}
      description={description ?? config.description}
      className="min-h-[132px]"
      onClick={() => onSelect(config.id)}
    />
  );
}
