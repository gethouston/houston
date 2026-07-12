import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentGrid } from "@/components/agent-grid";
import { CatalogEmpty } from "@/components/catalog-empty";
import { ExploreFilters } from "@/components/explore/explore-filters";
import { ExplorePagination } from "@/components/explore/explore-pagination";
import { listStoreIntegrations } from "@/lib/agents/integrations";
import { siteConfig } from "@/lib/site-config";
import { listAgents, listCategories } from "@/lib/store-api";
import { parseExploreParams } from "./search-params";

// Rendered dynamically (reads searchParams + the gateway); the per-fetch
// `revalidate` (60s) still caches catalog reads across requests at runtime.
export const dynamic = "force-dynamic";

interface ExplorePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: ExplorePageProps): Promise<Metadata> {
  const { q } = parseExploreParams(await searchParams);
  const title = q ? `Search: ${q}` : "Explore agents";
  return {
    title,
    description: `Browse and search the ${siteConfig.name}. ${siteConfig.description}`,
    alternates: { canonical: "/explore" },
  };
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = parseExploreParams(await searchParams);
  const [{ items, hasMore }, categories] = await Promise.all([
    listAgents(params),
    listCategories(),
  ]);
  const integrations = listStoreIntegrations();
  const categoryLabels = new Map(categories.map((c) => [c.slug, c.name]));
  const hasFilters = Boolean(params.q || params.category || params.integration);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Explore agents
        </h1>
        <p className="mt-2 text-muted-foreground">
          Search the catalog and filter by category or the apps an agent works
          with.
        </p>
      </header>

      <div className="mb-10">
        <ExploreFilters
          params={params}
          categories={categories}
          integrations={integrations}
        />
      </div>

      {items.length > 0 ? (
        <div className="flex flex-col gap-10">
          <AgentGrid agents={items} categoryLabels={categoryLabels} />
          <ExplorePagination params={params} hasMore={hasMore} />
        </div>
      ) : hasFilters ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/40 px-6 py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <SearchX aria-hidden className="size-6" />
          </span>
          <h2 className="mt-5 font-display text-xl font-semibold">
            No agents match those filters
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
            Try a different search or fewer filters. New agents are published
            all the time.
          </p>
          <Link
            href="/explore"
            className="mt-6 inline-flex h-10 items-center justify-center rounded-full border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Clear all filters
          </Link>
        </div>
      ) : (
        <CatalogEmpty />
      )}
    </main>
  );
}
