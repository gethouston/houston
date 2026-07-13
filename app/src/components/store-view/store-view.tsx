import {
  Button,
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  CatalogSearchField,
  CatalogShowMore,
} from "@houston-ai/core";
import type {
  StoreCatalogAgent,
  StoreCatalogSort,
} from "@houston-ai/engine-client";
import { fetchStoreAgent, fetchStoreCatalog } from "@houston-ai/engine-client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { reportError } from "../../lib/error-toast";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { StoreAgentIcon } from "./store-agent-icon";
import { StoreDetailDialog } from "./store-detail-dialog";
import { StoreCategoryChips, StoreSortToggle } from "./store-filters";
import { formatInstalls } from "./store-view-model";
import { useStoreInstall } from "./use-store-install";

/**
 * The Agent Store page (sidebar destination): the public catalog rendered in
 * the app's own catalog grammar — search + category chips over the flat row
 * grid, a row body opening the detail modal, and the row's `+` running the
 * one-click install (which hands off to the import wizard's scan/name flow).
 * All reads are the anonymous CORS-open gateway API; nothing here needs an
 * account until the moment of install.
 */
export function StoreView() {
  const { t, i18n } = useTranslation("store");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<StoreCatalogSort>("recent");
  const [detailAgent, setDetailAgent] = useState<StoreCatalogAgent | null>(
    null,
  );
  const { install, installingSlug } = useStoreInstall();

  // Debounce typing into the server-side full-text query.
  useEffect(() => {
    const handle = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const catalog = useInfiniteQuery({
    queryKey: ["store-catalog", q, category, sort],
    queryFn: ({ pageParam }) =>
      fetchStoreCatalog({
        q: q || undefined,
        category: category === "all" ? undefined : category,
        sort,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (last, all) =>
      last.hasMore ? all.length + 1 : undefined,
    staleTime: 60_000,
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

  const handleInstall = async (slug: string) => {
    if (await install(slug)) setDetailAgent(null);
  };

  return (
    <div className="h-full overflow-auto">
      <PageContainer className="py-10">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          className="mb-7"
        />

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <CatalogSearchField
            value={search}
            onChange={setSearch}
            label={t("searchPlaceholder")}
            className="flex-1"
          />
          <StoreSortToggle sort={sort} onSortChange={setSort} />
        </div>
        <StoreCategoryChips
          category={category}
          onCategoryChange={setCategory}
        />

        <div className="mt-6">
          {catalog.isPending ? (
            <RowsSkeleton />
          ) : catalog.isError ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <p className="text-sm text-ink-muted">{t("loadFailed")}</p>
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => void catalog.refetch()}
              >
                {t("retry")}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-muted">
              {t("empty")}
            </p>
          ) : (
            <>
              <CatalogGrid>
                {items.map((agent) => (
                  <CatalogRow
                    key={agent.id}
                    icon={<StoreAgentIcon agent={agent} />}
                    title={agent.name}
                    description={agent.tagline ?? agent.description}
                    trailing={
                      <span
                        className="shrink-0 text-[12px] text-ink-muted tabular-nums"
                        title={t("installs", { count: agent.installsCount })}
                      >
                        {formatInstalls(agent.installsCount, i18n.language)}
                      </span>
                    }
                    action={
                      agent.slug ? (
                        <CatalogAddButton
                          label={t("installLabel", { name: agent.name })}
                          busy={installingSlug === agent.slug}
                          disabled={installingSlug !== null}
                          onClick={() => void handleInstall(agent.slug ?? "")}
                        />
                      ) : undefined
                    }
                    onClick={() => setDetailAgent(agent)}
                  />
                ))}
              </CatalogGrid>
              {catalog.hasNextPage && (
                <CatalogShowMore
                  disabled={catalog.isFetchingNextPage}
                  onClick={() => void catalog.fetchNextPage()}
                >
                  {t("showMore")}
                </CatalogShowMore>
              )}
            </>
          )}
        </div>

        <StoreDetailDialog
          agent={detailAgent}
          onClose={() => setDetailAgent(null)}
          onInstall={(slug) => void handleInstall(slug)}
          installing={installingSlug !== null}
        />
      </PageContainer>
    </div>
  );
}

/** Row placeholders while the first page settles. Decorative only. */
function RowsSkeleton() {
  return (
    <div aria-hidden className="grid grid-cols-1 gap-1 lg:grid-cols-2">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-[60px] animate-pulse rounded-xl bg-chip" />
      ))}
    </div>
  );
}
