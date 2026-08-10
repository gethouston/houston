"use client";

import { useEffect, useState } from "react";
import type { CatalogSort, CatalogView } from "../components/catalog-controls";
import { CatalogControls } from "../components/catalog-controls";
import type { StoreLinkComponent } from "../types";
import { StoreScreenError, StoreScreenLoading } from "./screen-state";
import type { StoreHomeRows, StoreHomeState } from "./store-home-model";
import { StoreHomeResults } from "./store-home-results";

export const STORE_HOME_HERO_CLASS =
  "mx-auto max-w-[18ch] text-balance text-center font-light text-[clamp(32px,5vw,56px)] text-ink leading-[1.04] tracking-[-0.02em]";

const defaults = {
  hero: "Hire your next teammate",
  searchPlaceholder: "Search agents and creators",
  allCategories: "All categories",
  agents: "Agents",
  creators: "Creators",
  sortAgents: "Sort agents",
  mostInstalled: "Most installed",
  alphabetical: "Alphabetical",
  featuredAgents: "Featured agents",
  allAgents: "All agents",
  empty: "No agents here yet. Try another category or search.",
  loadFailed:
    "The store could not be reached. Check your connection and try again.",
  retry: "Try again",
};

export interface StoreHomeScreenProps {
  rows: StoreHomeRows;
  /**
   * Controlled mode: the host owns the browse state and renders the search
   * and filter controls in its own chrome (Houston's app puts them in its
   * page header), so the screen renders results only — no hero, no
   * `CatalogControls`. Absent, the screen is the site's self-contained page.
   */
  state?: StoreHomeState;
  /**
   * Lead the unfiltered agents view with the featured pair. An explicit
   * host opt-in, NOT inferred: a server-paginated surface (the website) must
   * not present page N's two biggest rows as curated picks, and only the
   * surface knows whether it is on the one true first page.
   */
  featured?: boolean;
  initialState?: Partial<StoreHomeState>;
  onStateChange?: (state: StoreHomeState) => void;
  agentHref: (agent: StoreHomeRows["agents"][number]) => string;
  creatorHref: (creator: StoreHomeRows["creators"][number]) => string;
  LinkComponent?: StoreLinkComponent;
  navigation?: React.ReactNode;
  pagination?: React.ReactNode;
  emptyLinks?: { publishHref: string; apiHref: string };
  onTryAgent?: (agent: StoreHomeRows["agents"][number]) => void;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  labels?: Partial<typeof defaults> & {
    agentCard?: object;
    creatorCard?: object;
  };
}

export function StoreHomeScreen(props: StoreHomeScreenProps) {
  const labels = { ...defaults, ...props.labels };
  const controlled = props.state !== undefined;
  const initialQuery = props.initialState?.query;
  const initialCategory = props.initialState?.category;
  const initialView = props.initialState?.view;
  const initialSort = props.initialState?.sort;
  const [ownState, setState] = useState<StoreHomeState>({
    query: "",
    view: "agents",
    sort: "installs",
    ...props.initialState,
  });
  const state = props.state ?? ownState;
  useEffect(() => {
    setState((current) => {
      const next = {
        query: initialQuery ?? current.query,
        category: initialCategory,
        view: initialView ?? current.view,
        sort: initialSort ?? current.sort,
      };
      return current.query === next.query &&
        current.category === next.category &&
        current.view === next.view &&
        current.sort === next.sort
        ? current
        : next;
    });
  }, [initialQuery, initialCategory, initialView, initialSort]);
  const update = (patch: Partial<StoreHomeState>) => {
    const next = { ...state, ...patch };
    setState(next);
    props.onStateChange?.(next);
  };
  return (
    <main className="min-h-full w-full text-ink">
      {props.navigation}
      <div
        className={
          controlled
            ? "mx-auto w-full max-w-[1040px] px-6 pt-6 pb-16 md:px-8"
            : "mx-auto w-full max-w-[1040px] px-6 pt-12 pb-16 md:px-8"
        }
      >
        <div className="flex flex-col items-center gap-16">
          {!controlled && (
            <>
              <h1 className={STORE_HOME_HERO_CLASS}>{labels.hero}</h1>
              <CatalogControls
                categories={props.rows.categories}
                {...state}
                onQueryChange={(query) => update({ query })}
                onCategoryChange={(category) => update({ category })}
                onViewChange={(view: CatalogView) => update({ view })}
                onSortChange={(sort: CatalogSort) => update({ sort })}
                labels={labels}
              />
            </>
          )}
          {props.loading ? (
            <StoreScreenLoading />
          ) : props.failed ? (
            <StoreScreenError
              message={labels.loadFailed}
              retryLabel={labels.retry}
              onRetry={props.onRetry}
            />
          ) : (
            <StoreHomeResults {...props} state={state} labels={labels} />
          )}
        </div>
      </div>
    </main>
  );
}
