import {
  fetchStoreCatalog,
  fetchStoreCategories,
  fetchStoreCreators,
  type StoreCatalogAgent,
} from "@houston-ai/engine-client";
import { StoreHomeScreen } from "@houston-ai/store";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { showErrorToast } from "../../lib/error-toast";
import {
  isStoreCategory,
  storeCategoryLabelKey,
} from "../../lib/store-categories";
import { actionLink } from "./store-link";
import {
  agentCardLabels,
  catalogControlLabels,
  creatorCardLabels,
} from "./store-shared-labels";
import { useStoreInstall } from "./use-store-install";

/** The home screen's three reads, shared with the shell's screen prefetch
 *  (`use-screen-prefetch.ts`) so boot warms the EXACT caches this screen
 *  mounts with — one source for keys, fetchers, and staleness. */
export function storeBrowseQueryOptions() {
  return {
    catalog: {
      queryKey: ["store-catalog-home"] as const,
      queryFn: () => fetchStoreCatalog({ sort: "installs" as const }),
      staleTime: 60_000,
    },
    categories: {
      queryKey: ["store-categories"] as const,
      queryFn: () => fetchStoreCategories(),
      staleTime: 86_400_000,
    },
    creators: {
      queryKey: ["store-creators", 1] as const,
      queryFn: () => fetchStoreCreators(),
      staleTime: 60_000,
    },
  };
}

export function StoreBrowse({
  onOpenAgent,
  onOpenCreator,
}: {
  onOpenAgent: (agent: StoreCatalogAgent) => void;
  onOpenCreator: (handle: string) => void;
}) {
  const { t } = useTranslation("store");
  const { install } = useStoreInstall();
  const { t: tPortable } = useTranslation("portable");
  const options = storeBrowseQueryOptions();
  const catalog = useQuery(options.catalog);
  const categories = useQuery(options.categories);
  const creators = useQuery(options.creators);
  const error = catalog.error ?? categories.error ?? creators.error;
  useEffect(() => {
    if (error) {
      showErrorToast("store_browse", "store browse fetch failed", error, {
        userMessage: t("loadFailed"),
      });
    }
  }, [error, t]);
  const rows = {
    agents: catalog.data?.items ?? [],
    creators: creators.data?.items ?? [],
    categories: (categories.data ?? []).map((item) => ({
      ...item,
      name: isStoreCategory(item.slug)
        ? tPortable(storeCategoryLabelKey(item.slug))
        : item.name,
    })),
  };
  const LinkComponent = useMemo(
    () =>
      actionLink((href) => {
        const [kind, value] = href.split(":", 2);
        if (kind === "agent") {
          const agent = rows.agents.find((item) => item.id === value);
          if (agent) onOpenAgent(agent);
        } else if (kind === "creator") onOpenCreator(value);
      }),
    [rows.agents, onOpenAgent, onOpenCreator],
  );
  const retry = () => {
    void Promise.all([
      catalog.refetch(),
      categories.refetch(),
      creators.refetch(),
    ]);
  };
  return (
    <StoreHomeScreen
      onTryAgent={(agent) => {
        if (agent.slug) void install(agent.slug);
      }}
      rows={rows}
      agentHref={(agent) => `agent:${agent.id}`}
      creatorHref={(creator) => `creator:${creator.handle}`}
      LinkComponent={LinkComponent}
      loading={catalog.isPending || categories.isPending || creators.isPending}
      failed={catalog.isError || categories.isError || creators.isError}
      onRetry={retry}
      labels={{
        hero: t("browse.heroTitle"),
        empty: t("empty"),
        loadFailed: t("loadFailed"),
        retry: t("retry"),
        ...catalogControlLabels(t),
        agentCard: agentCardLabels(t),
        creatorCard: creatorCardLabels(t),
      }}
    />
  );
}
