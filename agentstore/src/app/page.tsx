import { Badge } from "@houston-ai/core";
import { ArrowRight, Boxes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AgentGrid } from "@/components/agent-grid";
import { CatalogEmpty } from "@/components/catalog-empty";
import { CategoryChips } from "@/components/category-chips";
import { PublishPaths } from "@/components/home/publish-paths";
import { SearchForm } from "@/components/search-form";
import { siteConfig } from "@/lib/site-config";
import { listAgents, listCategories } from "@/lib/store-api";

// Rendered dynamically so `next build` never calls the gateway; the per-fetch
// `revalidate` (60s) still caches the catalog reads across requests at runtime.
export const dynamic = "force-dynamic";

const HOME_LIMIT = 9;

export function generateMetadata(): Metadata {
  return {
    title: siteConfig.name,
    description: siteConfig.description,
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  const [{ items }, categories] = await Promise.all([
    listAgents({ sort: "recent", page: 1 }),
    listCategories(),
  ]);
  const recent = items.slice(0, HOME_LIMIT);
  const categoryLabels = new Map(categories.map((c) => [c.slug, c.name]));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <section className="flex flex-col items-center pt-16 pb-12 text-center sm:pt-24">
        <Badge variant="secondary" className="mb-6 gap-1.5">
          <Boxes className="size-3.5" />
          {siteConfig.name}
        </Badge>
        <h1 className="max-w-3xl font-display text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Find an AI agent and install it in one click
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground text-pretty">
          {siteConfig.description} Publish the agents you build in Houston, then
          let anyone discover and run them.
        </p>
        <div className="mt-10 w-full max-w-xl">
          <SearchForm
            size="lg"
            placeholder="Search agents, e.g. inbox triage"
            label="Search the agent catalog"
          />
        </div>
      </section>

      <section aria-labelledby="browse-heading" className="pb-4">
        <h2 id="browse-heading" className="sr-only">
          Browse by category
        </h2>
        <CategoryChips
          categories={categories}
          hrefFor={(slug) => (slug ? `/explore?category=${slug}` : "/explore")}
        />
      </section>

      <section aria-labelledby="recent-heading" className="pt-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2
            id="recent-heading"
            className="font-display text-2xl font-semibold tracking-tight"
          >
            Recently published
          </h2>
          {recent.length > 0 && (
            <Link
              href="/explore"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Explore all
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>
        {recent.length > 0 ? (
          <AgentGrid agents={recent} categoryLabels={categoryLabels} />
        ) : (
          <CatalogEmpty />
        )}
      </section>

      <div className="pt-24 pb-4">
        <PublishPaths />
      </div>
    </main>
  );
}
