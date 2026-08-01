import { redirect } from "next/navigation";

interface ExplorePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** Compatibility redirect for old catalog links. Next's redirect is HTTP 307. */
export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const legacy = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["q", "category", "sort"] as const) {
    const value = first(legacy[key]);
    if (value) query.set(key, value);
  }
  redirect(query.size > 0 ? `/?${query}` : "/");
}
