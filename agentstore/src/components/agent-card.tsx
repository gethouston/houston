import type { StoreAgentSummary } from "@houston/agentstore-client";
import { Badge, cn } from "@houston-ai/core";
import { Download } from "lucide-react";
import Link from "next/link";
import { toDisplayIcon } from "@/lib/store-api-types";
import { AgentIcon } from "./agent-icon";

const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

/** Prettify a category slug when no catalog label is supplied. */
function labelFromSlug(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface AgentCardProps {
  agent: StoreAgentSummary;
  /** Human category label; falls back to a prettified slug. */
  categoryLabel?: string;
}

/**
 * A single agent in the catalog grid: icon, name, creator, a one-line summary,
 * its category, and the install tally. The whole card is one link to /a/<slug>,
 * with a visible focus ring and a hover lift (hover only enhances, never gates).
 */
export function AgentCard({ agent, categoryLabel }: AgentCardProps) {
  const summary = agent.tagline ?? agent.description;
  return (
    <Link
      href={`/a/${agent.slug}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <article
        className={cn(
          "flex h-full flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-all",
          "group-hover:-translate-y-0.5 group-hover:border-foreground/20 group-hover:shadow-md",
        )}
      >
        <div className="flex items-start gap-3">
          <AgentIcon
            icon={toDisplayIcon(agent.icon)}
            name={agent.name}
            className="size-11 text-xl"
          />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-base font-semibold text-card-foreground">
              {agent.name}
            </h3>
            <p className="truncate text-sm text-muted-foreground">
              By {agent.creator.displayName}
            </p>
          </div>
        </div>

        <p className="line-clamp-2 flex-1 text-sm text-muted-foreground text-pretty">
          {summary}
        </p>

        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="max-w-[60%] truncate">
            {categoryLabel ?? labelFromSlug(agent.category)}
          </Badge>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Download aria-hidden className="size-3.5" />
            {compactNumber.format(agent.installsCount)}
            <span className="sr-only">installs</span>
          </span>
        </div>
      </article>
    </Link>
  );
}
