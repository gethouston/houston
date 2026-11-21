"use client";

import { cn } from "@houston-ai/core";
import { Plus, Sparkle } from "lucide-react";
import { resolveIntegrationLabels } from "../integrations";
import type { StoreAgentRow, StoreLinkComponent } from "../types";
import { AgentTile } from "./agent-tile";
import { IntegrationMark } from "./integration-mark";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;
const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

export interface AgentCardLabels {
  newAgent: string;
  installs: string;
  tryNow: string;
}

const defaults: AgentCardLabels = {
  newAgent: "New",
  installs: "installs",
  tryNow: "Try it now",
};

export function AgentCard({
  agent,
  href,
  LinkComponent = PlainLink,
  onTry,
  action,
  labels: provided,
}: {
  agent: StoreAgentRow;
  href: string;
  LinkComponent?: StoreLinkComponent;
  onTry?: (agent: StoreAgentRow) => void;
  action?: React.ReactNode;
  labels?: Partial<AgentCardLabels>;
}) {
  const labels = { ...defaults, ...provided };
  return (
    <div className="group relative flex h-full flex-col rounded-[20px] bg-chip-subtle p-6 ring-1 ring-transparent transition-all duration-150 hover:bg-chip hover:ring-line">
      <LinkComponent
        href={href}
        aria-label={agent.name}
        className="absolute inset-0 rounded-[20px] focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none"
      >
        {""}
      </LinkComponent>
      <span className="pointer-events-none flex items-start justify-between gap-3">
        <AgentTile agent={agent} size="sm" />
        {action ??
          (onTry ? (
            <button
              type="button"
              onClick={() => onTry(agent)}
              aria-label={labels.tryNow}
              title={labels.tryNow}
              className={cornerActionClasses}
            >
              <Plus aria-hidden className="size-4" />
            </button>
          ) : null)}
      </span>
      <span className="pointer-events-none mt-12 truncate font-semibold text-[16px] text-ink tracking-tight">
        {agent.name}
      </span>
      <span className="pointer-events-none mt-1.5 line-clamp-2 text-[14px] text-ink-muted leading-[1.55]">
        {agent.tagline ?? agent.description}
      </span>
      <IntegrationLogos slugs={agent.integrations} className="mt-4" />
      <span className="pointer-events-none mt-auto flex items-center justify-between gap-3 pt-6 text-[13px] text-ink-muted">
        <span className="flex min-w-0 items-center gap-2">
          <CreatorFaceSmall creator={agent.creator} />
          <span className="truncate">{agent.creator.displayName}</span>
        </span>
        <AgentInstalls
          count={agent.installsCount}
          newAgent={labels.newAgent}
          installs={labels.installs}
        />
      </span>
    </div>
  );
}

export const cornerActionClasses =
  "pointer-events-auto relative z-10 grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink";

export function AgentInstalls({
  count,
  newAgent,
  installs,
}: {
  count: number;
  newAgent: string;
  installs: string;
}) {
  return count === 0 ? (
    <span className="shrink-0">{newAgent}</span>
  ) : (
    <span className="flex shrink-0 items-center gap-1 tabular-nums">
      <Sparkle aria-hidden className="size-3.5" />
      {compactNumber.format(count)}
      <span className="sr-only">{installs}</span>
    </span>
  );
}

export function IntegrationLogos({
  slugs,
  className,
}: {
  slugs: string[];
  className?: string;
}) {
  const logos = resolveIntegrationLabels(slugs.slice(0, 4));
  const overflow = slugs.length - logos.length;
  if (logos.length === 0) return null;
  return (
    <span
      className={cn(
        "pointer-events-none flex items-center gap-1.5 text-[12px] text-ink-muted",
        className,
      )}
    >
      {logos.map(({ slug, label }) => (
        <IntegrationMark
          key={slug}
          slug={slug}
          label={label}
          className="size-4"
        />
      ))}
      {overflow > 0 ? <span>+{overflow}</span> : null}
    </span>
  );
}

export function CreatorFaceSmall({ creator }: Pick<StoreAgentRow, "creator">) {
  return creator.avatarUrl ? (
    <img
      src={creator.avatarUrl}
      alt=""
      className="size-5 rounded-full object-cover"
    />
  ) : (
    <span className="grid size-5 place-items-center rounded-full bg-chip text-[10px] text-ink-muted">
      {creator.displayName.charAt(0).toUpperCase()}
    </span>
  );
}
