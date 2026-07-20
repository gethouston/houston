import {
  Button,
  CatalogAddButton,
  CatalogGrid,
  CatalogRow,
  CatalogShowMore,
} from "@houston-ai/core";
import type { StoreCatalogAgent } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { StoreAgentIcon } from "./store-agent-icon";
import { formatInstalls } from "./store-view-model";

/**
 * The Browse tab's result region: the load/error/empty/grid state machine over
 * a page of catalog listings. Purely presentational — the owning
 * {@link StoreBrowse} holds the query and install state and passes them in.
 */
export function StoreCatalogResults({
  items,
  isPending,
  isError,
  hasNextPage,
  isFetchingNextPage,
  installingSlug,
  onRetry,
  onShowMore,
  onInstall,
  onOpenDetail,
}: {
  items: StoreCatalogAgent[];
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  installingSlug: string | null;
  onRetry: () => void;
  onShowMore: () => void;
  onInstall: (slug: string) => void;
  onOpenDetail: (agent: StoreCatalogAgent) => void;
}) {
  const { t, i18n } = useTranslation("store");

  if (isPending) return <RowsSkeleton />;
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <p className="text-sm text-ink-muted">{t("loadFailed")}</p>
        <Button variant="outline" className="rounded-full" onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-ink-muted">{t("empty")}</p>
    );
  }

  return (
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
                  onClick={() => onInstall(agent.slug ?? "")}
                />
              ) : undefined
            }
            onClick={() => onOpenDetail(agent)}
          />
        ))}
      </CatalogGrid>
      {hasNextPage && (
        <CatalogShowMore disabled={isFetchingNextPage} onClick={onShowMore}>
          {t("showMore")}
        </CatalogShowMore>
      )}
    </>
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
