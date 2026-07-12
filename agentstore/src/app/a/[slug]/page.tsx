import type { AgentLearning } from "@houston/agentstore-contract";
import { Separator } from "@houston-ai/core";
import { ExternalLink, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentIcon } from "@/components/agent-icon";
import { InstallPanel } from "@/components/install-panel";
import { IntegrationChips } from "@/components/integration-chips";
import { Markdown } from "@/components/markdown";
import { ReportDialog } from "@/components/report-dialog";
import { SkillList } from "@/components/skill-list";
import { resolveIntegrationLabels } from "@/lib/agents/integrations";
import { taglineOrDescription } from "@/lib/export/shared";
import { buildInstallInstructions } from "@/lib/install/instructions";
import { siteConfig } from "@/lib/site-config";
import { getAgentBySlug } from "@/lib/store-api";

// Rendered dynamically so `next build` never calls the gateway; the per-fetch
// `revalidate` (60s) still caches agent reads across requests at runtime.
export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ slug: string }>;
}

/** Absolute URLs the detail page and its install surface point at. */
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
  const { name } = ir.identity;
  const summary = taglineOrDescription(ir, 200);
  const { pageUrl } = agentUrls(slug);

  return {
    title: name,
    description: summary,
    keywords: ir.identity.tags,
    alternates: { canonical: pageUrl },
    openGraph: {
      type: "website",
      title: name,
      description: summary,
      url: pageUrl,
      siteName: siteConfig.name,
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description: summary,
    },
  };
}

export default async function AgentDetailPage({ params }: PageParams) {
  const { slug } = await params;
  const data = await getAgentBySlug(slug);
  if (!data) notFound();

  const { ir } = data;
  const { identity } = ir;
  const urls = agentUrls(slug);
  const integrations = resolveIntegrationLabels(ir.integrations);
  const instructions = buildInstallInstructions(ir, {
    irUrl: urls.irUrl,
    bundleUrl: urls.skillZipUrl,
    pageUrl: urls.pageUrl,
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <AgentIcon
          icon={identity.icon}
          name={identity.name}
          className="size-16 text-3xl sm:size-20 sm:text-4xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {identity.name}
          </h1>
          {identity.tagline && (
            <p className="mt-2 text-lg text-muted-foreground text-pretty">
              {identity.tagline}
            </p>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            By{" "}
            {identity.creator.url ? (
              <a
                href={identity.creator.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4"
              >
                {identity.creator.displayName}
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            ) : (
              <span className="font-medium text-foreground">
                {identity.creator.displayName}
              </span>
            )}
          </p>
        </div>
      </header>

      <Separator className="my-10" />

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-12">
          <section>
            <h2 className="mb-4 font-display text-lg font-semibold">
              About this agent
            </h2>
            <Markdown content={identity.description} />
          </section>

          {ir.skills.length > 0 && (
            <section>
              <h2 className="mb-4 font-display text-lg font-semibold">
                What it can do
              </h2>
              <SkillList skills={ir.skills} />
            </section>
          )}

          {integrations.length > 0 && (
            <section>
              <h2 className="mb-2 font-display text-lg font-semibold">
                Built to work with
              </h2>
              <p className="mb-4 text-sm text-muted-foreground">
                The apps this agent is designed around. It only acts on services
                you have actually connected.
              </p>
              <IntegrationChips integrations={integrations} />
            </section>
          )}

          {ir.learnings.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
                <Sparkles aria-hidden className="size-4 text-primary" />
                What it has learned
              </h2>
              <ul className="flex flex-col gap-2">
                {ir.learnings.map((learning: AgentLearning) => (
                  <li
                    key={learning.id}
                    className="rounded-lg border bg-card/50 px-4 py-3 text-sm text-foreground/90"
                  >
                    {learning.text}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-8 lg:h-fit">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <InstallPanel
              agentName={identity.name}
              instructions={instructions}
              skillZipUrl={urls.skillZipUrl}
              copyPasteUrl={urls.copyPasteUrl}
              shareUrl={urls.pageUrl}
            />
          </div>
        </aside>
      </div>

      <Separator className="mt-12 mb-6" />

      <footer className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Something wrong with this agent? Let us know.
        </p>
        <ReportDialog slug={slug} agentName={identity.name} />
      </footer>
    </main>
  );
}
