import type { AgentCardLabels } from "../components/agent-card";
import { CatalogEmpty, FilteredEmpty } from "../components/catalog-empty";
import type { CreatorCardLabels } from "../components/creator-card";
import { AgentGrid, CreatorGrid } from "../components/grids";
import type { StoreLinkComponent } from "../types";
import type { StoreHomeRows, StoreHomeState } from "./store-home-model";

export function StoreHomeResults({
  rows,
  state,
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
  agentHref: (agent: StoreHomeRows["agents"][number]) => string;
  creatorHref: (creator: StoreHomeRows["creators"][number]) => string;
  LinkComponent?: StoreLinkComponent;
  pagination?: React.ReactNode;
  emptyLinks?: { publishHref: string; apiHref: string };
  onTryAgent?: (agent: StoreHomeRows["agents"][number]) => void;
  labels: {
    creators: string;
    empty: string;
    agentCard?: Partial<AgentCardLabels>;
    creatorCard?: Partial<CreatorCardLabels>;
  };
}) {
  const agents = filterStoreAgents(rows.agents, state);
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
      {agents.length ? (
        <section className="flex flex-col gap-10">
          <AgentGrid
            agents={agents}
            agentHref={agentHref}
            LinkComponent={LinkComponent}
            onTry={onTryAgent}
            labels={labels.agentCard}
          />
          {!state.query ? pagination : null}
        </section>
      ) : null}
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

import { filterStoreAgents, filterStoreCreators } from "./store-home-model";
