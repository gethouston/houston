import type {
  StoreAgentSummary,
  StoreCatalogPage,
} from "@houston/agentstore-client";

export async function walkCatalogPages(
  load: (page: number) => Promise<StoreCatalogPage>,
  visit: (agent: StoreAgentSummary) => void,
  maxPages: number,
): Promise<void> {
  for (let page = 1; page <= maxPages; page++) {
    const result = await load(page);
    for (const agent of result.items) visit(agent);
    if (!result.hasMore) break;
  }
}

export async function collectPublicSlugs(
  load: (page: number) => Promise<StoreCatalogPage>,
  maxPages: number,
): Promise<string[]> {
  const slugs: string[] = [];
  await walkCatalogPages(
    load,
    (agent) => {
      if (agent.slug) slugs.push(agent.slug);
    },
    maxPages,
  );
  return slugs;
}

export async function collectPublicCreatorHandles(
  load: (page: number) => Promise<StoreCatalogPage>,
  maxPages: number,
): Promise<string[]> {
  const handles = new Set<string>();
  await walkCatalogPages(
    load,
    (agent) => {
      if (agent.creator.handle) handles.add(agent.creator.handle);
    },
    maxPages,
  );
  return [...handles];
}
