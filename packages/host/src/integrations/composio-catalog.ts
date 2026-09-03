import type { ComposioHttp } from "./composio-http";
import type { RawToolkit } from "./composio-wire";

/** Composio caps a toolkits page at 1000 whatever `limit` says. */
const PAGE_SIZE = "1000";

/** Upper bound on catalog pages walked per fetch (1000 toolkits each). */
const MAX_CATALOG_PAGES = 10;

/**
 * The whole toolkits catalog, every page. The catalog outgrew one page (1502
 * toolkits, 2026-09): reading only the first silently dropped telegram, odoo,
 * quickbooks… so this walks `next_cursor` until it is null. The seen-cursor
 * and page-count guards keep a misbehaving upstream from looping forever; a
 * failing page throws (no partial catalog served as if complete).
 */
export async function fetchAllRawToolkits(
  http: ComposioHttp,
): Promise<RawToolkit[]> {
  const items: RawToolkit[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
    const body = await http.call<{
      items?: RawToolkit[];
      next_cursor?: string | null;
    }>("/api/v3/toolkits", { query: { limit: PAGE_SIZE, cursor } });
    items.push(...(body?.items ?? []));
    const next = body?.next_cursor ?? undefined;
    if (!next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }
  return items;
}
