import type { IntegrationToolkit } from "@houston/engine-adapter";

export const BROWSE_PAGE_SIZE = 100;

export function matchesQuery(t: IntegrationToolkit, query: string): boolean {
  if (!query) return true;
  return (
    t.name.toLowerCase().includes(query) ||
    t.slug.toLowerCase().includes(query) ||
    (t.description ?? "").toLowerCase().includes(query)
  );
}

export function byNameAsc(
  a: IntegrationToolkit,
  b: IntegrationToolkit,
): number {
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function browseCatalog(opts: {
  catalog: IntegrationToolkit[];
  query: string;
  category: string;
  connected: ReadonlySet<string>;
}): IntegrationToolkit[] {
  let filtered = opts.catalog.filter(
    (t) => !opts.connected.has(t.slug) && !t.noAuth,
  );
  if (opts.category !== "all") {
    filtered = filtered.filter((t) =>
      (t.categories ?? []).includes(opts.category),
    );
  }
  const q = opts.query.trim().toLowerCase();
  if (q) filtered = filtered.filter((t) => matchesQuery(t, q));
  return filtered.sort(byNameAsc);
}

export function categoriesOf(catalog: IntegrationToolkit[]): string[] {
  const seen = new Set<string>();
  for (const t of catalog) {
    for (const c of t.categories ?? []) seen.add(c);
  }
  return [...seen].sort((a, b) =>
    categoryLabel(a).localeCompare(categoryLabel(b)),
  );
}

export function categoryLabel(cat: string): string {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/-/g, " ");
}

export function toolkitsInCategory(
  catalog: IntegrationToolkit[],
  category: string,
): Set<string> | null {
  if (category === "all") return null;
  const set = new Set<string>();
  for (const t of catalog) {
    if ((t.categories ?? []).includes(category)) set.add(t.slug);
  }
  return set;
}

export type CategoryListView = "list" | "empty" | "empty-category";

export function categoryListView(args: {
  visibleCount: number;
  hasAny: boolean;
  categoryFiltered: boolean;
}): CategoryListView {
  if (args.visibleCount > 0) return "list";
  return args.categoryFiltered && args.hasAny ? "empty-category" : "empty";
}

export const UNCATEGORIZED = "__uncategorized";
