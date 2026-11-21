import type { ComposioHttp } from "./composio-http";
import type { RawToolkit } from "./composio-wire";

const PAGE_SIZE = "1000";

const MAX_CATALOG_PAGES = 10;

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
