"use client";

import { integrationLogoUrl, resolveIntegrationLabels } from "../integrations";
import type { StoreAgentRow, StoreLinkComponent } from "../types";
import { AgentTile } from "./agent-tile";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;
const compactNumber = new Intl.NumberFormat("en", { notation: "compact" });

export interface AgentCardLabels {
  skill: string;
  skills: string;
  newAgent: string;
  installs: string;
  tryNow: string;
}

const defaults: AgentCardLabels = {
  skill: "skill",
  skills: "skills",
  newAgent: "New",
  installs: "installs",
  tryNow: "Try it now",
};

/**
 * THE agent card. A div with a full-card link OVERLAY (never a button nested
 * in an anchor), so the visible Try button can sit above it validly. Hover
 * shifts colour and reveals the hairline — never position.
 */
export function AgentCard({
  agent,
  href,
  LinkComponent = PlainLink,
  onTry,
  labels: provided,
}: {
  agent: StoreAgentRow;
  href: string;
  LinkComponent?: StoreLinkComponent;
  /** The surface's install action for the visible Try button. */
  onTry?: (agent: StoreAgentRow) => void;
  labels?: Partial<AgentCardLabels>;
}) {
  const labels = { ...defaults, ...provided };
  const logos = resolveIntegrationLabels(agent.integrations.slice(0, 4));
  const overflow = agent.integrations.length - logos.length;
  const skillsCount = agent.skills?.length ?? 0;
  return (
    <div className="group relative flex flex-col rounded-[20px] bg-chip-subtle p-6 ring-1 ring-transparent transition-all duration-150 hover:bg-chip hover:ring-line">
      <LinkComponent
        href={href}
        aria-label={agent.name}
        className="absolute inset-0 rounded-[20px] focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none"
      >
        {""}
      </LinkComponent>
      <span className="pointer-events-none flex items-center gap-4">
        <AgentTile agent={agent} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-[16px] text-ink tracking-tight">
            {agent.name}
          </span>
          <span className="mt-1 flex items-center gap-2 text-[13px] text-ink-muted">
            {skillsCount > 0 ? (
              <>
                {skillsCount} {skillsCount === 1 ? labels.skill : labels.skills}
                {logos.length > 0 ? <span aria-hidden>·</span> : null}
              </>
            ) : null}
            <span className="flex items-center gap-1.5">
              {logos.map(({ slug, label }) => (
                <img
                  key={slug}
                  src={integrationLogoUrl(slug)}
                  alt={label}
                  title={label}
                  className="size-3.5"
                />
              ))}
              {overflow > 0 ? <span>+{overflow}</span> : null}
            </span>
          </span>
        </span>
      </span>
      <span className="pointer-events-none mt-4 line-clamp-3 text-[14px] text-ink/85 leading-[1.55]">
        {agent.tagline ?? agent.description}
      </span>
      <span className="pointer-events-none mt-4 flex items-center justify-between gap-3 text-[12px] text-ink-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <CreatorFaceSmall creator={agent.creator} />
          <span className="truncate">{agent.creator.displayName}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0 tabular-nums">
            {agent.installsCount === 0
              ? labels.newAgent
              : `${compactNumber.format(agent.installsCount)} ${labels.installs}`}
          </span>
        </span>
        {onTry ? (
          <button
            type="button"
            onClick={() => onTry(agent)}
            className="pointer-events-auto relative z-10 shrink-0 rounded-full bg-action px-3.5 py-1.5 font-medium text-[12px] text-action-text transition-opacity duration-150 hover:opacity-90"
          >
            {labels.tryNow}
          </button>
        ) : null}
      </span>
    </div>
  );
}

function CreatorFaceSmall({ creator }: Pick<StoreAgentRow, "creator">) {
  return creator.avatarUrl ? (
    <img
      src={creator.avatarUrl}
      alt=""
      className="size-4 rounded-full object-cover"
    />
  ) : (
    <span className="grid size-4 place-items-center rounded-full bg-chip text-[9px] text-ink-muted">
      {creator.displayName.charAt(0).toUpperCase()}
    </span>
  );
}
