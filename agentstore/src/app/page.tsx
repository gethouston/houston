import type { CreatorDirectoryEntry } from "@houston/agentstore-client";
import type { Metadata } from "next";
import { CatalogResults } from "@/components/home/catalog-results";
import {
  type HomeCatalogParams,
  parseHomeCatalogParams,
} from "@/lib/home-catalog-params";
import { siteConfig } from "@/lib/site-config";
import { listAgents, listCategories, listCreators } from "@/lib/store-api";

export const dynamic = "force-dynamic";

const CREATOR_SEARCH_PAGE_LIMIT = 3;

export function generateMetadata(): Metadata {
  return {
    title: siteConfig.name,
    description: siteConfig.description,
    alternates: { canonical: "/" },
  };
}

interface HomePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function loadCreators() {
  const creators: CreatorDirectoryEntry[] = [];
  // Interim only. HOU-1070 moves universal search into the gateway.
  for (let page = 1; page <= CREATOR_SEARCH_PAGE_LIMIT; page++) {
    const result = await listCreators(page);
    creators.push(...result.items);
    if (!result.hasMore) break;
  }
  return creators;
}

async function loadCatalog(params: HomeCatalogParams) {
  if (params.view === "creators") {
    if (params.q) {
      return { agents: [], creators: await loadCreators(), hasMore: false };
    }
    const page = await listCreators(params.page);
    return { agents: [], creators: page.items, hasMore: page.hasMore };
  }
  const [{ items, hasMore }, creators] = await Promise.all([
    listAgents({
      category: params.category,
      sort: params.sort,
      page: params.page,
    }),
    loadCreators(),
  ]);
  return { agents: items, creators, hasMore };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = parseHomeCatalogParams(await searchParams);
  const [categories, catalog] = await Promise.all([
    listCategories(),
    loadCatalog(params),
  ]);

  return (
    <div className="canvas-screen min-h-screen w-full bg-background">
      <CatalogResults params={params} categories={categories} {...catalog} />
    </div>
  );
}
