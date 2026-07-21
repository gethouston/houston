/**
 * Server-side facade over the Agent Store SDK for the gateway's PUBLIC catalog
 * API. Called only from server components (home, explore, agent page, sitemap)
 * and the server route handlers (bundle, install-instructions, ir). Never
 * imported by client code — it reads the private `AGENTSTORE_GATEWAY_URL` and
 * sends no credentials (all routes here are public/anonymous).
 *
 * This module owns only the server-specific concerns: which gateway origin to
 * hit, and the explicit per-call `next.revalidate` caching (60s catalog + agent
 * reads, 3600s categories; the install write is uncacheable). All HTTP and error
 * plumbing lives in `@houston/agentstore-client`.
 *
 * SERVER ONLY: reads the private `AGENTSTORE_GATEWAY_URL` (undefined in the
 * browser) and is imported exclusively by server components + route handlers.
 */
import {
  AgentStoreClient,
  type StoreAgentDetail,
  type StoreAgentSummary,
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
import { serverGatewayBase } from "./store-api-types";

/** Revalidate window (seconds) for catalog + agent-page reads. */
const CATALOG_REVALIDATE = 60;
/** Revalidate window (seconds) for the static category list. */
const CATEGORIES_REVALIDATE = 3600;
/** Hard cap on sitemap enumeration so a huge catalog cannot fan out unbounded. */
const SITEMAP_MAX_PAGES = 50;

/**
 * A fresh SDK client bound to the private server gateway origin. Read per call
 * so a `next build` with no env still succeeds; the base is only needed at
 * request time.
 */
function client(): AgentStoreClient {
  return new AgentStoreClient({ baseUrl: serverGatewayBase() });
}

/** Per-call Next caching options for a read with the given revalidate window. */
function revalidate(seconds: number): StoreRequestOptions {
  return { init: { next: { revalidate: seconds } } };
}

/**
 * Normalize catalog params to the gateway's expectations: UPPERCASE the
 * integration toolkit slug, and omit the default `recent` sort so it never
 * appears in the query string.
 */
function toCatalogQuery(params: StoreCatalogQuery): StoreCatalogQuery {
  const integration = params.integration?.trim();
  return {
    q: params.q,
    category: params.category,
    integration: integration ? integration.toUpperCase() : undefined,
    sort: params.sort === "installs" ? "installs" : undefined,
    page: params.page,
  };
}

/** One page of published, public agents for the browsable catalog. */
export function listAgents(
  params: StoreCatalogQuery,
): Promise<StoreCatalogPage> {
  return client().listAgents(
    toCatalogQuery(params),
    revalidate(CATALOG_REVALIDATE),
  );
}

/** The controlled category vocabulary for the filter/chips rows. */
export function listCategories(): Promise<StoreCategory[]> {
  return client().listCategories(revalidate(CATEGORIES_REVALIDATE));
}

/**
 * A creator's public page: their profile plus one page of their public agents.
 * Returns null on 404 (no such handle) so the page can `notFound()`; any other
 * failure throws so a gateway outage is a real error rather than a silent miss.
 */
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

/**
 * A published agent by slug, with its IR snapshot. Returns null on 404 (unknown,
 * deleted, or never-published slug); any other failure throws so a gateway outage
 * is a real error rather than a silent "not found".
 */
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

/**
 * Walk the public catalog page by page (24/page), invoking `visit` for each
 * agent, until `hasMore` is false or the page cap is hit — the cap bounds a
 * hostile/huge catalog to a predictable request count. Shared by the sitemap
 * enumerations so they never diverge on how far they crawl.
 */
async function walkPublicCatalog(
  visit: (agent: StoreAgentSummary) => void,
): Promise<void> {
  for (let page = 1; page <= SITEMAP_MAX_PAGES; page++) {
    const { items, hasMore } = await listAgents({ sort: "recent", page });
    for (const agent of items) visit(agent);
    if (!hasMore) break;
  }
}

/** Every public slug, newest first, for the sitemap. */
export async function listAllPublicSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  await walkPublicCatalog((agent) => {
    if (agent.slug) slugs.push(agent.slug);
  });
  return slugs;
}

/**
 * Every distinct creator handle credited on a public agent, for the sitemap's
 * creator pages. A creator with no public agent is intentionally omitted (there
 * would be nothing to crawl on their page); one walk of the same catalog.
 */
export async function listAllPublicCreatorHandles(): Promise<string[]> {
  const handles = new Set<string>();
  await walkPublicCatalog((agent) => {
    const handle = agent.creator.handle;
    if (handle) handles.add(handle);
  });
  return [...handles];
}

/**
 * Record an anonymous install of a published agent. Server-side only (called from
 * the bundle route after a successful export) so no browser CORS is involved. The
 * gateway owns the rate limit (per client IP) and the counter; this only fires
 * the event. `clientIp`, when given, is forwarded as `X-Forwarded-For` so the
 * gateway attributes the rate limit to the real downloader, not the store pod.
 */
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

/** Fetch just the IR of a published agent (thin proxy target). Null on 404. */
export async function getAgentIr(slug: string): Promise<AgentIR | null> {
  const detail = await getAgentBySlug(slug);
  return detail ? detail.ir : null;
}
