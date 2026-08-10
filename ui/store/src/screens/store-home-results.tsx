import type { AgentCardLabels } from "../components/agent-card";
import { CatalogEmpty, FilteredEmpty } from "../components/catalog-empty";
import type { CreatorCardLabels } from "../components/creator-card";
import { FeaturedAgentCard } from "../components/featured-agent-card";
import { AgentGrid, CreatorGrid } from "../components/grids";
import type { StoreLinkComponent } from "../types";
import type { StoreHomeRows, StoreHomeState } from "./store-home-model";

export function StoreHomeResults({
  rows,
  state,
  featured: featuredEnabled,
  agentHref,
  creatorHref,
  LinkComponent,
  pagination,
  emptyLinks,
  onTryAgent,
  labels,
}: {
  rows: StoreHomeRows;
  state: StoreHomeState;
  /** Host opt-in for the featured pair — see StoreHomeScreenProps.featured. */
  featured?: boolean;
  agentHref: (agent: StoreHomeRows["agents"][number]) => string;
  creatorHref: (creator: StoreHomeRows["creators"][number]) => string;
  LinkComponent?: StoreLinkComponent;
  pagination?: React.ReactNode;
  emptyLinks?: { publishHref: string; apiHref: string };
  onTryAgent?: (agent: StoreHomeRows["agents"][number]) => void;
  labels: {
    creators: string;
    empty: string;
    featuredAgents: string;
    allAgents: string;
    agentCard?: Partial<AgentCardLabels>;
    creatorCard?: Partial<CreatorCardLabels>;
  };
}) {
  const { featured, rest } = featuredEnabled
    ? splitFeaturedAgents(rows.agents, state)
    : { featured: [], rest: filterStoreAgents(rows.agents, state) };
  const agents = featured.length ? [...featured, ...rest] : rest;
  const creators = filterStoreCreators(rows.creators, state.query);
  const filtered = Boolean(state.query || state.category);
  if (
    (state.view === "agents" && agents.length === 0 && creators.length === 0) ||
    (state.view === "creators" && creators.length === 0)
  ) {
    return filtered ? (
      <FilteredEmpty LinkComponent={LinkComponent} />
    ) : emptyLinks ? (
      <CatalogEmpty {...emptyLinks} />
    ) : (
      <p className="py-16 text-center text-sm text-ink-muted">{labels.empty}</p>
    );
  }
  if (state.view === "creators") {
    return (
      <div className="flex w-full flex-col gap-10">
        <CreatorGrid
          {...{ creators, creatorHref, LinkComponent }}
          labels={labels.creatorCard}
        />
        {!state.query ? pagination : null}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-14">
      {featured.length ? (
        <section className="flex flex-col gap-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {labels.featuredAgents}
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {featured.map((agent) => (
              <FeaturedAgentCard
                key={agent.id}
                agent={agent}
                href={agentHref(agent)}
                LinkComponent={LinkComponent}
                labels={labels.agentCard}
              />
            ))}
          </div>
        </section>
      ) : null}
      {rest.length ? (
        <section className="flex flex-col gap-5">
          {featured.length ? (
            <h2 className="font-display text-xl font-semibold tracking-tight">
              {labels.allAgents}
            </h2>
          ) : null}
          <AgentGrid
            agents={rest}
            agentHref={agentHref}
            LinkComponent={LinkComponent}
            onTry={onTryAgent}
            labels={labels.agentCard}
          />
        </section>
      ) : null}
      {/* Outside the grid section: a page whose every agent went featured
          still has more catalog behind it. */}
      {!state.query ? pagination : null}
      {state.query && creators.length ? (
        <section className="flex flex-col gap-5">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            {labels.creators}
          </h2>
          <CreatorGrid
            creators={creators}
            creatorHref={creatorHref}
            LinkComponent={LinkComponent}
            labels={labels.creatorCard}
          />
        </section>
      ) : null}
    </div>
  );
}

import {
  filterStoreAgents,
  filterStoreCreators,
  splitFeaturedAgents,
} from "./store-home-model";
