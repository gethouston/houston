/**
 * Server-side client for the Houston gateway's PUBLIC Agent Store API. Called
 * only from server components (home, explore, agent page, sitemap) and the two
 * server route handlers (bundle, install-instructions). Never imported by client
 * code — it reads the private `AGENTSTORE_GATEWAY_URL` and sends no credentials
 * (all routes here are public/anonymous).
 *
 * Caching is explicit per call: catalog + agent reads use `next.revalidate = 60`,
 * the category list uses a long revalidate (it is a static Go list), and the
 * install write is uncacheable. No route relies on the fetch default.
 *
 * SERVER ONLY: reads the private `AGENTSTORE_GATEWAY_URL` (undefined in the
 * browser) and is imported exclusively by server components + route handlers.
 */
import type { AgentIR } from "@houston/agentstore-contract";
import {
  type AgentDetail,
  type AgentSummary,
  type CatalogPage,
  type InstallTarget,
  type ListAgentsParams,
  STORE_API_PREFIX,
  type StoreCategory,
  serverGatewayBase,
  toStoreApiError,
} from "./store-api-types";

/** Revalidate window (seconds) for catalog + agent-page reads. */
const CATALOG_REVALIDATE = 60;
/** Revalidate window (seconds) for the static category list. */
const CATEGORIES_REVALIDATE = 3600;
/** Hard cap on sitemap enumeration so a huge catalog cannot fan out unbounded. */
const SITEMAP_MAX_PAGES = 50;

/** Absolute URL for a store API path (already prefixed by the caller). */
function apiUrl(path: string): string {
  return `${serverGatewayBase()}${STORE_API_PREFIX}${path}`;
}

/** GET a JSON resource with an explicit revalidate window, mapping errors. */
async function getJson<T>(path: string, revalidate: number): Promise<T> {
  const res = await fetch(apiUrl(path), { next: { revalidate } });
  if (!res.ok) throw await toStoreApiError(res);
  return (await res.json()) as T;
}

/** Encode catalog list params into a query string, dropping empty values. */
function catalogQuery(params: ListAgentsParams): string {
  const qs = new URLSearchParams();
  if (params.q?.trim()) qs.set("q", params.q.trim());
  if (params.category?.trim()) qs.set("category", params.category.trim());
  if (params.integration?.trim())
    qs.set("integration", params.integration.trim().toUpperCase());
  if (params.sort === "installs") qs.set("sort", "installs");
  if (params.page && params.page > 1) qs.set("page", String(params.page));
  const query = qs.toString();
  return query ? `?${query}` : "";
}

/** One page of published, public agents for the browsable catalog. */
export function listAgents(params: ListAgentsParams): Promise<CatalogPage> {
  return getJson<CatalogPage>(
    `/agents${catalogQuery(params)}`,
    CATALOG_REVALIDATE,
  );
}

/** The controlled category vocabulary for the filter/chips rows. */
export async function listCategories(): Promise<StoreCategory[]> {
  const { items } = await getJson<{ items: StoreCategory[] }>(
    "/categories",
    CATEGORIES_REVALIDATE,
  );
  return items;
}

/**
 * A published agent by slug, with its IR snapshot. Returns null on 404 (unknown,
 * deleted, or never-published slug); any other failure throws so a gateway outage
 * is a real error rather than a silent "not found".
 */
export async function getAgentBySlug(
  slug: string,
): Promise<AgentDetail | null> {
  const clean = slug.trim();
  if (!clean) return null;
  const res = await fetch(apiUrl(`/agents/${encodeURIComponent(clean)}`), {
    next: { revalidate: CATALOG_REVALIDATE },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw await toStoreApiError(res);
  return (await res.json()) as AgentDetail;
}

/**
 * Every public slug, newest first, for the sitemap. The gateway paginates the
 * catalog (24/page), so this walks pages until `hasMore` is false or the page cap
 * is hit — the cap bounds a hostile/huge catalog to a predictable request count.
 */
export async function listAllPublicSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  for (let page = 1; page <= SITEMAP_MAX_PAGES; page++) {
    const { items, hasMore } = await listAgents({ sort: "recent", page });
    for (const agent of items) if (agent.slug) slugs.push(agent.slug);
    if (!hasMore) break;
  }
  return slugs;
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
  target: InstallTarget,
  opts: { clientIp?: string } = {},
): Promise<void> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (opts.clientIp) headers["x-forwarded-for"] = opts.clientIp;
  const res = await fetch(
    apiUrl(`/agents/${encodeURIComponent(slug)}/installs`),
    {
      method: "POST",
      headers,
      body: JSON.stringify({ target }),
      cache: "no-store",
    },
  );
  if (!res.ok) throw await toStoreApiError(res);
}

/** Fetch just the IR of a published agent (thin proxy target). Null on 404. */
export async function getAgentIr(slug: string): Promise<AgentIR | null> {
  const detail = await getAgentBySlug(slug);
  return detail ? detail.ir : null;
}

export type { AgentDetail, AgentIR, AgentSummary, CatalogPage, StoreCategory };
