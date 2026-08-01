import type { StoreAgentSummary } from "@houston/agentstore-client";
import { AgentDetailScreen } from "@houston-ai/store";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BioSection } from "@/components/bio-section";
import { CreatorBlock } from "@/components/creator-block";
import { InstallPanel } from "@/components/install-panel";
import { ReportDialog } from "@/components/report-dialog";
import { SkillList } from "@/components/skill-list";
import { StoreNav } from "@/components/store-nav";
import { taglineOrDescription } from "@/lib/export/shared";
import { buildInstallInstructions } from "@/lib/install/instructions";
import { siteConfig } from "@/lib/site-config";
import { getAgentBySlug, getCreator } from "@/lib/store-api";

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ slug: string }>;
}

function agentUrls(slug: string) {
  const base = siteConfig.url.replace(/\/$/, "");
  return {
    pageUrl: `${base}/a/${slug}`,
    irUrl: `${base}/api/agents/${slug}/ir`,
    skillZipUrl: `${base}/api/agents/${slug}/bundle?target=claude-skill-zip`,
    copyPasteUrl: `${base}/api/agents/${slug}/bundle?target=copy-paste`,
  };
}

export async function generateMetadata({
  params,
}: PageParams): Promise<Metadata> {
  const { slug } = await params;
  const data = await getAgentBySlug(slug);
  if (!data) return { title: "Agent not found" };
  const { ir } = data;
  const summary = taglineOrDescription(ir, 200);
  const { pageUrl } = agentUrls(slug);
  return {
    title: ir.identity.name,
    description: summary,
    keywords: ir.identity.tags,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      title: ir.identity.name,
      description: summary,
      url: pageUrl,
      siteName: siteConfig.name,
    },
    twitter: {
      card: "summary_large_image",
      title: ir.identity.name,
      description: summary,
    },
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AgentDetailPage({ params }: PageParams) {
  const { slug } = await params;
  const data = await getAgentBySlug(slug);
  if (!data) notFound();
  const { ir, agent } = data;
  const { identity } = ir;
  const urls = agentUrls(slug);
  const instructions = buildInstallInstructions(ir, {
    irUrl: urls.irUrl,
    bundleUrl: urls.skillZipUrl,
    pageUrl: urls.pageUrl,
  });
  let moreAgents: StoreAgentSummary[] = [];
  if (agent.creator.handle) {
    const creator = await getCreator(agent.creator.handle);
    moreAgents = (creator?.agents.items ?? [])
      .filter((item) => item.id !== agent.id)
      .slice(0, 3);
  }

  return (
    <main className="canvas-screen min-h-screen bg-background text-ink">
      <StoreNav />
      <div className="mx-auto w-full max-w-[1040px] px-6 pt-12 pb-16 md:px-8">
        <AgentDetailScreen
          agent={{
            ...agent,
            name: identity.name,
            description: identity.description,
            tagline: identity.tagline,
            learningsCount: ir.learnings.length,
          }}
          skills={ir.skills}
          creator={
            <CreatorBlock
              creator={agent.creator}
              fallback={identity.creator}
              compact
            />
          }
          actions={
            <InstallPanel
              agentName={identity.name}
              slug={slug}
              instructions={instructions}
            />
          }
          renderBio={(description, tagline) => (
            <BioSection tagline={tagline ?? null} description={description} />
          )}
          renderSkills={() => <SkillList skills={ir.skills} />}
          moreAgents={moreAgents}
          agentHref={(item) => `/a/${item.slug}`}
          LinkComponent={Link}
          footer={
            <footer className="flex items-center gap-4 text-ink-muted text-sm">
              <span>Updated {formatDate(agent.updatedAt)}</span>
              <ReportDialog slug={slug} agentName={identity.name} />
            </footer>
          }
        />
      </div>
    </main>
  );
}
