import {
  AgentStoreClient,
  type CreatorDirectoryPage,
  type StoreAgentDetail,
  StoreApiError,
  type StoreCatalogPage,
  type StoreCatalogQuery,
  type StoreCatalogSort,
  type StoreCategory,
  type StoreCreatorPage,
  type StoreInstallTarget,
  type StoreRequestOptions,
} from "@houston/agentstore-client";
import type { AgentIR } from "@houston/agentstore-contract";
import { alphabetizeCatalogPage } from "./catalog-sort";
import {
  collectPublicCreatorHandles,
  collectPublicSlugs,
} from "./catalog-walk";
import { serverGatewayBase } from "./store-api-types";

type StoreListQuery = Omit<StoreCatalogQuery, "sort"> & {
  sort?: StoreCatalogSort | "alphabetical";
};

const CATALOG_REVALIDATE = 60;
const CATEGORIES_REVALIDATE = 3600;
const SITEMAP_MAX_PAGES = 50;

function client(): AgentStoreClient {
  return new AgentStoreClient({ baseUrl: serverGatewayBase() });
}

function revalidate(seconds: number): StoreRequestOptions {
  return { init: { next: { revalidate: seconds } } };
}

function toCatalogQuery(params: StoreListQuery): StoreCatalogQuery {
  const integration = params.integration?.trim();
  return {
    q: params.q,
    category: params.category,
    integration: integration ? integration.toUpperCase() : undefined,
    sort:
      params.sort === "installs" || params.sort === "alphabetical"
        ? "installs"
        : undefined,
    page: params.page,
  };
}

export async function listAgents(
  params: StoreListQuery,
): Promise<StoreCatalogPage> {
  const page = await client().listAgents(
    toCatalogQuery(params),
    revalidate(CATALOG_REVALIDATE),
  );
  if (params.sort !== "alphabetical") return page;
  return alphabetizeCatalogPage(page);
}

export function listCreators(page = 1): Promise<CreatorDirectoryPage> {
  return client().listCreators(page, revalidate(CATALOG_REVALIDATE));
}

export function listCategories(): Promise<StoreCategory[]> {
  return client().listCategories(revalidate(CATEGORIES_REVALIDATE));
}

export async function getCreator(
  handle: string,
  query: { page?: number; sort?: StoreCatalogSort } = {},
): Promise<StoreCreatorPage | null> {
  const clean = handle.trim();
  if (!clean) return null;
  try {
    return await client().getCreator(
      clean,
      query,
      revalidate(CATALOG_REVALIDATE),
    );
  } catch (err) {
    if (err instanceof StoreApiError && err.status === 404) return null;
    throw err;
  }
}

export async function getAgentBySlug(
  slug: string,
): Promise<StoreAgentDetail | null> {
  const clean = slug.trim();
  if (!clean) return null;
  try {
    return await client().getAgent(clean, revalidate(CATALOG_REVALIDATE));
  } catch (err) {
    if (err instanceof StoreApiError && err.status === 404) return null;
    throw err;
  }
}

export function listAllPublicSlugs(): Promise<string[]> {
  return collectPublicSlugs(
    (page) => listAgents({ sort: "recent", page }),
    SITEMAP_MAX_PAGES,
  );
}

export function listAllPublicCreatorHandles(): Promise<string[]> {
  return collectPublicCreatorHandles(
    (page) => listAgents({ sort: "recent", page }),
    SITEMAP_MAX_PAGES,
  );
}

export async function recordInstall(
  slug: string,
  target: StoreInstallTarget,
  opts: { clientIp?: string } = {},
): Promise<void> {
  const headers: Record<string, string> = {};
  if (opts.clientIp) headers["x-forwarded-for"] = opts.clientIp;
  await client().recordInstall(slug, target, {
    headers,
    init: { cache: "no-store" },
  });
}

export async function getAgentIr(slug: string): Promise<AgentIR | null> {
  const detail = await getAgentBySlug(slug);
  return detail ? detail.ir : null;
}
