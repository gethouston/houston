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
  onSelect: (id: string) => void;
}

export function AgentCard({ config, onSelect }: AgentCardProps) {
  return (
    <SkillCard
      image={config.image}
      media={
        config.image ? undefined : <AgentAvatar config={config} size="md" />
      }
      title={config.name}
      description={config.description}
      className="min-h-[132px]"
      onClick={() => onSelect(config.id)}
    />
  );
}
