import type { StoreCatalogSort } from "@houston/agentstore-client";
import { HANDLE_REGEX, normalizeHandle } from "@houston/agentstore-contract";
import { cn } from "@houston-ai/core";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CreatorProfileView } from "@/components/creator-profile-view";
import { CreatorReportDialog } from "@/components/creator-report-dialog";
import { SocialLinks } from "@/components/social-links";
import { StoreNav } from "@/components/store-nav";
import { buildCreatorHref } from "@/lib/creator-href";
import { siteBase } from "@/lib/site-config";
import { getCreator } from "@/lib/store-api";
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
  const data = await getCreator(handle, view);
  if (!data) notFound();

  const { profile, agents } = data;
  const exactStats =
    view.page === 1 && !agents.hasMore
      ? {
          agents: agents.items.length,
          installs: agents.items.reduce(
            (total, agent) => total + agent.installsCount,
            0,
          ),
        }
      : undefined;

  return (
    <main className="canvas-screen min-h-screen bg-background text-ink">
      <StoreNav />
      <div className="mx-auto w-full max-w-[1040px] px-6 pt-12 pb-16 md:px-8">
        <CreatorProfileView
          profile={profile}
          agents={agents.items}
          stats={exactStats}
          socialLinks={<SocialLinks links={profile.links} className="mt-2.5" />}
          actions={
            <div className="flex gap-2">
              {SORTS.map((option) => (
                <Link
                  key={option.value}
                  href={buildCreatorHref(handle, { sort: option.value })}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none",
                    view.sort === option.value
                      ? "bg-action text-action-text"
                      : "bg-chip-subtle text-ink-muted hover:bg-chip hover:text-ink",
                  )}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          }
          pagination={
            <CreatorPagination
              handle={handle}
              sort={view.sort}
              page={view.page}
              hasMore={agents.hasMore}
            />
          }
        />
        <footer className="mt-16">
          {profile.handle && <CreatorReportDialog handle={profile.handle} />}
        </footer>
      </div>
    </main>
  );
}
