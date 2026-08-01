export type CatalogView = "agents" | "creators";
export type HomeCatalogSort = "installs" | "alphabetical";

export interface HomeCatalogParams {
  view: CatalogView;
  q?: string;
  category?: string;
  sort: HomeCatalogSort;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

export function parseHomeCatalogParams(params: RawParams): HomeCatalogParams {
  const page = Math.trunc(Number(first(params.page))) || 1;
  return {
    view: first(params.view) === "creators" ? "creators" : "agents",
    q: first(params.q),
    category: first(params.category),
    sort: first(params.sort) === "alphabetical" ? "alphabetical" : "installs",
    page: page > 0 ? page : 1,
  };
}

export function homeCatalogHref(
  current: HomeCatalogParams,
  patch: Partial<HomeCatalogParams>,
): string {
  const next = { ...current, ...patch };
  const query = new URLSearchParams();
  if (next.view === "creators") query.set("view", "creators");
  if (next.q) query.set("q", next.q);
  if (next.view === "agents" && next.category) {
    query.set("category", next.category);
  }
  if (next.view === "agents" && next.sort === "alphabetical") {
    query.set("sort", "alphabetical");
  }
  if (next.page > 1) query.set("page", String(next.page));
  const value = query.toString();
  return value ? `/?${value}` : "/";
}
