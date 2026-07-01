import { useState } from "react";
import type { AgentConfig, StoreListing } from "../../lib/types";
import { SkillCard } from "../skill-card";
import { AgentAvatar } from "./agent-avatar";
export { AgentAvatar, HoustonLogo, getAgentIcon, getAgentIconColor, getHoustonLogo, isLightColor } from "./agent-avatar";

interface AgentCardProps {
  config: AgentConfig;
  /** Localized display name (falls back to `config.name`). */
  title?: string;
  /** Localized display description (falls back to `config.description`). */
  description?: string;
  onSelect: (id: string) => void;
}

export function AgentCard({ config, title, description, onSelect }: AgentCardProps) {
  return (
    <SkillCard
      image={config.image}
      media={
        config.image ? undefined : <AgentAvatar config={config} size="md" />
      }
      title={title ?? config.name}
      description={description ?? config.description}
      integrations={config.integrations}
      maxIntegrations={8}
      className="min-h-[132px]"
      onClick={() => onSelect(config.id)}
    />
  );
}

interface StoreAgentCardProps {
  listing: StoreListing;
  onInstall: (listing: StoreListing) => Promise<void>;
  onSelect: (id: string) => void;
}

export function StoreAgentCard({
  listing,
  onInstall,
  onSelect,
}: StoreAgentCardProps) {
  const [installing, setInstalling] = useState(false);

  const handleClick = async () => {
    setInstalling(true);
    try {
      await onInstall(listing);
      onSelect(listing.id);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <SkillCard
      title={listing.name}
      description={listing.description}
      image={listing.icon_url}
      integrations={listing.integrations}
      maxIntegrations={8}
      className="min-h-[132px]"
      onClick={handleClick}
      disabled={installing}
      busy={installing}
    />
  );
}
