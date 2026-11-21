import type { IntegrationToolkit } from "@houston/engine-adapter";
import {
  byNameAsc,
  categoryLabel,
  matchesQuery,
  UNCATEGORIZED,
} from "./browse-model.ts";
import { categoryRank } from "./category-priority.ts";

export const MOST_USED = "__mostUsed";

export const MOST_USED_SLUGS: readonly string[] = [
  "gmail",
  "googlecalendar",
  "notion",
  "googlesheets",
  "slack",
  "outlook",
  "twitter",
  "googledrive",
  "googledocs",
  "asana",
  "shopify",
  "linkedin",
  "calendly",
  "trello",
  "dropbox",
  "whatsapp",
  "zoom",
  "canva",
  "instagram",
];

function mostUsedToolkits(
  catalog: IntegrationToolkit[],
  connected: ReadonlySet<string>,
): IntegrationToolkit[] {
  const bySlug = new Map<string, IntegrationToolkit>();
  for (const t of catalog) bySlug.set(t.slug.toLowerCase(), t);
  const mostUsed: IntegrationToolkit[] = [];
  for (const slug of MOST_USED_SLUGS) {
    const tk = bySlug.get(slug);
    if (tk && !connected.has(tk.slug)) mostUsed.push(tk);
  }
  return mostUsed;
}

export const SECTION_PREVIEW_CAP = 6;

export interface CatalogSection {
  category: string;
  connectable: IntegrationToolkit[];
}

export function groupCatalogByCategory(opts: {
  catalog: IntegrationToolkit[];
  query: string;
  connected: ReadonlySet<string>;
  category?: string;
}): CatalogSection[] {
  const q = opts.query.trim().toLowerCase();
  const only = opts.category && opts.category !== "all" ? opts.category : null;
  const buckets = new Map<string, IntegrationToolkit[]>();
  for (const t of opts.catalog) {
    if (opts.connected.has(t.slug)) continue;
    if (t.noAuth) continue;
    if (!matchesQuery(t, q)) continue;
    let category: string;
    if (only) {
      if (!(t.categories ?? []).includes(only)) continue;
      category = only;
    } else {
      category = t.categories?.[0] || UNCATEGORIZED;
    }
    const bucket = buckets.get(category);
    if (bucket) bucket.push(t);
    else buckets.set(category, [t]);
  }
  const sections: CatalogSection[] = [];
  for (const [category, connectable] of buckets) {
    connectable.sort(byNameAsc);
    sections.push({ category, connectable });
  }
  sections.sort((a, b) => {
    if (a.category === UNCATEGORIZED) return 1;
    if (b.category === UNCATEGORIZED) return -1;
    const rankA = categoryRank(a.category);
    const rankB = categoryRank(b.category);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    const bySize = b.connectable.length - a.connectable.length;
    if (bySize !== 0) return bySize;
    return categoryLabel(a.category).localeCompare(categoryLabel(b.category));
  });
  if (!q && !only) {
    const mostUsed = mostUsedToolkits(opts.catalog, opts.connected);
    if (mostUsed.length > 0) {
      sections.unshift({ category: MOST_USED, connectable: mostUsed });
    }
  }
  return sections;
}

export function catalogCategorySlugs(opts: {
  catalog: IntegrationToolkit[];
  connected: ReadonlySet<string>;
}): string[] {
  return groupCatalogByCategory({ ...opts, query: "" })
    .map((s) => s.category)
    .filter((c) => c !== MOST_USED)
    .sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return categoryLabel(a).localeCompare(categoryLabel(b));
    });
}
