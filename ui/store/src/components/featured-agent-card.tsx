"use client";

import { HoustonHelmet } from "@houston-ai/core";
import type { StoreAgentRow, StoreLinkComponent } from "../types";
import {
  type AgentCardLabels,
  AgentInstalls,
  IntegrationLogos,
} from "./agent-card";
import { agentTone } from "./agent-tile";

const PlainLink: StoreLinkComponent = (props) => <a {...props} />;

const defaults: Pick<AgentCardLabels, "newAgent" | "installs"> = {
  newAgent: "New",
  installs: "installs",
};

/**
 * The wide card the featured row wears: the CREATOR is the hero — their
 * photo fills the field, because a featured agent is an endorsement of the
 * person behind it — and under it the agent's name, two lines of what it
 * does, the integrations it uses, and the quiet baseline the regular card
 * ends on. A creator without a photo hands the field to the agent's tone and
 * mark. Same overlay-link grammar as the regular card: the whole card is the
 * way in, nothing else competes.
 */
export function FeaturedAgentCard({
  agent,
  href,
  LinkComponent = PlainLink,
  labels: provided,
}: {
  agent: StoreAgentRow;
  href: string;
  LinkComponent?: StoreLinkComponent;
  labels?: Partial<Pick<AgentCardLabels, "newAgent" | "installs">>;
}) {
  const labels = { ...defaults, ...provided };
  const tone = agentTone(agent);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[20px] bg-chip-subtle ring-1 ring-transparent transition-all duration-150 hover:bg-chip hover:ring-line">
      <LinkComponent
        href={href}
        aria-label={agent.name}
        className="absolute inset-0 z-10 rounded-[20px] focus-visible:ring-2 focus-visible:ring-focus/50 focus-visible:outline-none"
      >
        {""}
      </LinkComponent>
      <span className="pointer-events-none block aspect-[2/1] w-full">
        {agent.creator.avatarUrl ? (
          <img
            src={agent.creator.avatarUrl}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <span
            className="grid size-full place-items-center text-white/90"
            style={{
              background: `linear-gradient(145deg, color-mix(in oklab, ${tone} 88%, white 12%), ${tone} 55%, color-mix(in oklab, ${tone} 82%, black 18%))`,
            }}
          >
            {agent.icon?.kind === "emoji" ? (
              <span className="text-6xl">{agent.icon.value}</span>
            ) : (
              <HoustonHelmet color="currentColor" size={56} />
            )}
          </span>
        )}
      </span>
      <span className="pointer-events-none flex flex-col p-5">
        <span className="truncate font-semibold text-[17px] text-ink tracking-tight">
          {agent.name}
        </span>
        <span className="mt-1 line-clamp-2 text-[14px] text-ink-muted leading-[1.55]">
          {agent.tagline ?? agent.description}
        </span>
        <IntegrationLogos slugs={agent.integrations} className="mt-3" />
        <span className="mt-3 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
          <span className="min-w-0 truncate">{agent.creator.displayName}</span>
          <AgentInstalls
            count={agent.installsCount}
            newAgent={labels.newAgent}
            installs={labels.installs}
          />
        </span>
      </span>
    </div>
  );
}
