import type {
  CreatorDirectoryRow,
  StoreAgentRow,
  StoreLinkComponent,
} from "../types";
import { AgentCard, type AgentCardLabels } from "./agent-card";
import { CreatorCard, type CreatorCardLabels } from "./creator-card";

export function AgentGrid({
  agents,
  agentHref,
  LinkComponent,
  onTry,
  labels,
}: {
  agents: StoreAgentRow[];
  agentHref: (agent: StoreAgentRow) => string;
  LinkComponent?: StoreLinkComponent;
  onTry?: (agent: StoreAgentRow) => void;
  labels?: Partial<AgentCardLabels>;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          href={agentHref(agent)}
          LinkComponent={LinkComponent}
          onTry={onTry}
          labels={labels}
        />
      ))}
    </div>
  );
}

export function CreatorGrid({
  creators,
  creatorHref,
  LinkComponent,
  labels,
}: {
  creators: CreatorDirectoryRow[];
  creatorHref: (creator: CreatorDirectoryRow) => string;
  LinkComponent?: StoreLinkComponent;
  labels?: Partial<CreatorCardLabels>;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {creators.map((creator) => (
        <CreatorCard
          key={creator.handle}
          creator={creator}
          href={creatorHref(creator)}
          LinkComponent={LinkComponent}
          labels={labels}
        />
      ))}
    </div>
  );
}
