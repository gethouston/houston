import type { StoreCatalogSort } from "@houston/agentstore-client";
import { HANDLE_REGEX, normalizeHandle } from "@houston/agentstore-contract";
import { cn, Separator } from "@houston-ai/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentGrid } from "@/components/agent-grid";
import { buildCreatorHref } from "@/lib/creator-href";
import { siteBase } from "@/lib/site-config";
import { getCreator, listCategories } from "@/lib/store-api";
import { CreatorHeader } from "./creator-header";
import { CreatorPagination } from "./creator-pagination";

// Rendered dynamically so `next build` never calls the gateway; the per-fetch
// `revalidate` (60s) still caches creator reads across requests at runtime.
export const dynamic = "force-dynamic";

interface CreatorPageProps {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** The tab options for the creator's agents, with the href each points at. */
const SORTS: ReadonlyArray<{ value: StoreCatalogSort; label: string }> = [
  { value: "recent", label: "Recent" },
  { value: "installs", label: "Most installed" },
];

/** Read a single string search param, trimmed. */
function firstParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

/** Normalize the path handle; null when it fails the grammar (a sure 404). */
function readHandle(raw: string): string | null {
  const handle = normalizeHandle(raw);
  return HANDLE_REGEX.test(handle) ? handle : null;
}

/** Parse `?sort=` and `?page=` into a canonical view. */
function readView(sp: Record<string, string | string[] | undefined>): {
  sort: StoreCatalogSort;
  page: number;
} {
  const page = Math.trunc(Number(firstParam(sp.page))) || 1;
  return {
    sort: firstParam(sp.sort) === "installs" ? "installs" : "recent",
    page: page < 1 ? 1 : page,
  };
}

export async function generateMetadata({
  params,
}: CreatorPageProps): Promise<Metadata> {
  const handle = readHandle((await params).handle);
  if (!handle) return { title: "Creator not found" };
  const data = await getCreator(handle);
  if (!data) return { title: "Creator not found" };

  const { profile } = data;
  const url = `${siteBase()}/@${handle}`;
  const description =
    profile.bio || `Agents published by @${handle} on the Houston Agent Store.`;
  return {
    title: `${profile.displayName} (@${handle})`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title: `${profile.displayName} (@${handle})`,
      description,
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: profile.displayName,
      description,
    },
  };
}

export default async function CreatorPage({
  params,
  searchParams,
}: CreatorPageProps) {
  const handle = readHandle((await params).handle);
  if (!handle) notFound();
  const view = readView(await searchParams);
  const [data, categories] = await Promise.all([
    getCreator(handle, view),
    listCategories(),
  ]);
  if (!data) notFound();

  const { profile, agents } = data;
  const categoryLabels = new Map(categories.map((c) => [c.slug, c.name]));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <CreatorHeader profile={profile} />

      <Separator className="my-10" />

      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Agents
        </h2>
        <div className="flex gap-2">
          {SORTS.map((option) => (
            <Link
              key={option.value}
              href={buildCreatorHref(handle, { sort: option.value })}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                view.sort === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {agents.items.length > 0 ? (
        <div className="flex flex-col gap-10">
          <AgentGrid agents={agents.items} categoryLabels={categoryLabels} />
          <CreatorPagination
            handle={handle}
            sort={view.sort}
            page={view.page}
            hasMore={agents.hasMore}
          />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed bg-card/40 px-6 py-14 text-center">
          <p className="text-sm text-muted-foreground text-pretty">
            This creator has no public agents yet.
          </p>
        </div>
      )}
    </main>
  );
}
