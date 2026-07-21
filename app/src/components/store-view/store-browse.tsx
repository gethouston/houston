import { HANDLE_REGEX, normalizeHandle } from "@houston/agentstore-contract";
import { CatalogSearchField } from "@houston-ai/core";
import type {
  StoreCatalogAgent,
  StoreCatalogSort,
} from "@houston-ai/engine-client";
import { fetchStoreAgent, fetchStoreCatalog } from "@houston-ai/engine-client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";
import { StoreCatalogResults } from "./store-catalog-results";
import { StoreDetailDialog } from "./store-detail-dialog";
import { StoreCategoryChips, StoreSortToggle } from "./store-filters";
import { StoreIntegrationFilter } from "./store-integration-filter";
import { browseIntegrationOptions } from "./store-view-model";
import { useStoreInstall } from "./use-store-install";

/** The sentinel for "no filter", shared by the category and integration filters. */
const ALL = "all";

/**
 * The Agent Store's Browse tab: the public catalog in the app's catalog grammar
 * (search + category chips + integration filter over the flat row grid, a row
 * body opening the detail modal, the row's `+` running the one-click install).
 * All reads are the anonymous CORS-open gateway; nothing here needs an account
 * until the moment of install. Consumes the one-shot `storeFocusSlug` deep link
 * to open the detail dialog, so "See it in the store" works from either tab.
 */
export function StoreBrowse() {
  const { t } = useTranslation("store");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState(ALL);
  const [integration, setIntegration] = useState(ALL);
  const [sort, setSort] = useState<StoreCatalogSort>("recent");
  const [detailAgent, setDetailAgent] = useState<StoreCatalogAgent | null>(
    null,
  );
  const { install, installingSlug } = useStoreInstall();

  // Debounce typing into the server-side full-text query. A leading `@` is an
  // intent to open a creator's profile, not a catalog search: when what follows
  // is a valid handle, route to that creator's pane (via the ui store, mirroring
  // "See it in the store") and leave the catalog query untouched.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = search.trim();
      if (trimmed.startsWith("@")) {
        const candidate = normalizeHandle(trimmed);
        if (HANDLE_REGEX.test(candidate)) {
          useUIStore.getState().setStoreCreatorHandle(candidate);
          return;
        }
      }
      setQ(trimmed);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const catalog = useInfiniteQuery({
    queryKey: ["store-catalog", q, category, integration, sort],
    queryFn: ({ pageParam }) =>
      fetchStoreCatalog({
        q: q || undefined,
        category: category === ALL ? undefined : category,
        integration:
          integration === ALL ? undefined : integration.toUpperCase(),
        sort,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, all) =>
      last.hasMore ? all.length + 1 : undefined,
    staleTime: 60_000,
  });

  // The filter's option vocabulary must not come from the result set it scopes:
  // selecting a toolkit refetches the catalog to only that toolkit's agents, so
  // the grid can no longer name the other toolkits a user might switch to. When a
  // filter is active, read the vocabulary from a dedicated catalog page that omits
  // the integration filter (still scoped by search/category/sort); with no filter
  // active the grid is already that unfiltered source. See browseIntegrationOptions.
  const optionCatalog = useQuery({
    queryKey: ["store-catalog-options", q, category, sort],
    queryFn: () =>
      fetchStoreCatalog({
        q: q || undefined,
        category: category === ALL ? undefined : category,
        sort,
        page: 1,
      }),
    staleTime: 60_000,
    enabled: integration !== ALL,
  });

  // One-shot deep link: "See it in the store" surfaces set a slug before
  // switching views; consume it into the detail dialog (a vanished listing
  // just reports — the catalog behind it is already the right fallback).
  const focusSlug = useUIStore((s) => s.storeFocusSlug);
  useEffect(() => {
    if (!focusSlug) return;
    useUIStore.getState().setStoreFocusSlug(null);
    fetchStoreAgent(focusSlug)
      .then((detail) => setDetailAgent(detail.agent))
      .catch((err: unknown) => {
        reportError(
          "store_focus",
          `store focus fetch failed (${focusSlug})`,
          err,
        );
      });
  }, [focusSlug]);

  const items = catalog.data?.pages.flatMap((page) => page.items) ?? [];

  // The connected apps offered as filter options, sourced so a chosen toolkit
  // never collapses the set of toolkits a user can switch to: the loaded grid
  // when unfiltered, else the dedicated unfiltered read. See
  // browseIntegrationOptions.
  const integrations = useMemo(
    () =>
      browseIntegrationOptions(
        catalog.data?.pages.flatMap((page) => page.items) ?? [],
        optionCatalog.data?.items ?? [],
        integration === ALL ? null : integration,
      ),
    [catalog.data, optionCatalog.data, integration],
  );

  const handleInstall = async (slug: string) => {
    if (await install(slug)) setDetailAgent(null);
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <CatalogSearchField
          value={search}
          onChange={setSearch}
          label={t("searchPlaceholder")}
          className="flex-1"
        />
        {integrations.length > 0 && (
          <StoreIntegrationFilter
            value={integration}
            onChange={setIntegration}
            integrations={integrations}
          />
        )}
        <StoreSortToggle sort={sort} onSortChange={setSort} />
      </div>
      <StoreCategoryChips category={category} onCategoryChange={setCategory} />

      <div className="mt-6">
        <StoreCatalogResults
          items={items}
          isPending={catalog.isPending}
          isError={catalog.isError}
          hasNextPage={catalog.hasNextPage}
          isFetchingNextPage={catalog.isFetchingNextPage}
          installingSlug={installingSlug}
          onRetry={() => void catalog.refetch()}
          onShowMore={() => void catalog.fetchNextPage()}
          onInstall={(slug) => void handleInstall(slug)}
          onOpenDetail={setDetailAgent}
          onOpenCreator={(handle) =>
            useUIStore.getState().setStoreCreatorHandle(handle)
          }
        />
      </div>

      <StoreDetailDialog
        agent={detailAgent}
        onClose={() => setDetailAgent(null)}
        onInstall={(slug) => void handleInstall(slug)}
        installing={installingSlug !== null}
      />
    </div>
  );
}
