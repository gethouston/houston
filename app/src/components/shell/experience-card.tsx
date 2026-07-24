import type { AgentConfig } from "../../lib/types";
import { SkillCard } from "../skill-card";
import { skillIntegrationChips } from "../skill-integration-chips";
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
      footer={skillIntegrationChips(config.integrations)}
      className="min-h-[132px]"
      onClick={() => onSelect(config.id)}
    />
  );
}
