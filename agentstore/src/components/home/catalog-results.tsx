"use client";

import type {
  CreatorDirectoryEntry,
  StoreAgentSummary,
  StoreCategory,
} from "@houston/agentstore-client";
import { StoreHomeScreen, type StoreHomeState } from "@houston-ai/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StoreNav } from "@/components/store-nav";
import {
  type HomeCatalogParams,
  homeCatalogHref,
} from "@/lib/home-catalog-params";
import { launchStoreInstall } from "@/lib/houston-launch";
import { agentSchemaUrl } from "@/lib/store-api-types";
import { CatalogPagination } from "./catalog-pagination";

const HOME_LIMIT = 9;

export function CatalogResults({
  params,
  categories,
  agents,
  creators,
  hasMore,
}: {
  params: HomeCatalogParams;
  categories: StoreCategory[];
  agents: StoreAgentSummary[];
  creators: CreatorDirectoryEntry[];
  hasMore: boolean;
}) {
  const router = useRouter();
  const initialState = {
    query: params.q ?? "",
    category: params.category,
    view: params.view,
    sort: params.sort,
  };
  const isHome =
    !params.q &&
    !params.category &&
    params.sort === "installs" &&
    params.page === 1;
  const rows = {
    agents: isHome ? agents.slice(0, HOME_LIMIT) : agents,
    creators,
    categories,
  };
  const onStateChange = (state: StoreHomeState) => {
    const next = {
      q: state.query || undefined,
      category: state.category,
      view: state.view,
      sort: state.sort,
      page: 1,
    };
    const href = homeCatalogHref(params, next);
    if (
      state.query !== (params.q ?? "") &&
      state.category === params.category &&
      state.view === params.view &&
      state.sort === params.sort
    ) {
      window.history.replaceState(window.history.state, "", href);
    } else {
      router.push(href);
    }
  };
  return (
    <StoreHomeScreen
      onTryAgent={(agent) => {
        if (agent.slug) launchStoreInstall(agent.slug);
      }}
      rows={rows}
      initialState={initialState}
      onStateChange={onStateChange}
      agentHref={(agent) => `/a/${agent.slug}`}
      creatorHref={(creator) =>
        `/creators/${encodeURIComponent(creator.handle)}`
      }
      LinkComponent={Link}
      navigation={<StoreNav />}
      emptyLinks={{
        publishHref: "https://gethouston.ai",
        apiHref: agentSchemaUrl(),
      }}
      pagination={<CatalogPagination params={params} hasMore={hasMore} />}
    />
  );
}
