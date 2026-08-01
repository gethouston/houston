import { cn } from "@houston-ai/core";
import type { ReactNode } from "react";
import type { AgentCardLabels } from "../components/agent-card";
import { AgentGrid } from "../components/grids";
import {
  type CreatorProfileOwner,
  OwnedAgentGrid,
} from "../components/owned-agent-grid";
import type {
  OwnedAgentRow,
  StoreCreatorProfile,
  StoreLinkComponent,
} from "../types";
import { CreatorProfileHero } from "./creator-profile-hero";
import { StoreScreenError, StoreScreenLoading } from "./screen-state";

const defaults = {
  agents: "Agents",
  agent: "agent",
  agentsNoun: "agents",
  install: "install",
  installs: "installs",
  noAgents: "This creator has no public agents yet.",
  loadFailed: "This profile could not be loaded. Please try again.",
  retry: "Try again",
};

export function CreatorProfileScreen({
  profile,
  agents,
  stats,
  socialLinks,
  actions,
  agentHref,
  LinkComponent,
  pagination,
  agentCardLabels,
  labels: provided,
  loading,
  failed,
  onRetry,
  onTryAgent,
  owner,
}: {
  profile?: StoreCreatorProfile;
  agents: OwnedAgentRow[];
  stats?: { agents: number; installs: number };
  socialLinks?: ReactNode;
  actions?: ReactNode;
  agentHref: (agent: OwnedAgentRow) => string;
  LinkComponent?: StoreLinkComponent;
  pagination?: ReactNode;
  agentCardLabels?: Partial<AgentCardLabels>;
  labels?: Partial<typeof defaults>;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  /** The surface's install action for the cards' visible Try button. */
  onTryAgent?: (agent: OwnedAgentRow) => void;
  owner?: CreatorProfileOwner;
}) {
  const labels = { ...defaults, ...provided };
  if (loading) return <StoreScreenLoading />;
  if (failed || !profile) {
    return (
      <StoreScreenError
        message={labels.loadFailed}
        retryLabel={labels.retry}
        onRetry={onRetry}
      />
    );
  }
  return (
    <>
      <CreatorProfileHero
        profile={profile}
        stats={stats}
        socialLinks={socialLinks}
        owner={owner}
        LinkComponent={LinkComponent}
        labels={labels}
      />
      <section className="mt-14">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {labels.agents}
          </h2>
          {actions}
        </div>
        {agents.length ? (
          <div className="flex flex-col gap-10">
            {owner ? (
              <OwnedAgentGrid
                agents={agents}
                owner={owner}
                agentHref={agentHref}
                onTryAgent={onTryAgent}
                agentCardLabels={agentCardLabels}
                LinkComponent={LinkComponent}
              />
            ) : (
              <AgentGrid
                agents={agents}
                agentHref={agentHref}
                LinkComponent={LinkComponent}
                onTry={onTryAgent}
                labels={agentCardLabels}
              />
            )}
            {pagination}
          </div>
        ) : (
          <div
            className={cn("rounded-2xl bg-chip-subtle px-6 py-14 text-center")}
          >
            <p className="text-sm text-ink-muted text-pretty">
              {labels.noAgents}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
