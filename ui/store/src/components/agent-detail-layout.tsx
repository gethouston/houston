import type { ReactNode } from "react";

import type { StoreAgentRow } from "../types";
import { AgentTile } from "./agent-tile";

export function AgentDetailLayout({
  agent,
  creator,
  actions,
  bio,
  skills,
  integrations,
  learnings,
  moreAgents,
  footer,
  labels = {},
}: {
  agent: StoreAgentRow;
  creator: ReactNode;
  actions?: ReactNode;
  bio: ReactNode;
  skills?: ReactNode;
  integrations?: ReactNode;
  learnings?: number;
  moreAgents?: ReactNode;
  footer?: ReactNode;
  labels?: Partial<{
    newAgent: string;
    installs: string;
    bio: string;
    skills: string;
    worksWith: string;
    learning: string;
    learnings: string;
    moreFrom: string;
    carries: string;
  }>;
}) {
  const text = {
    newAgent: "New",
    installs: "installs",
    bio: "Bio",
    skills: "Skills",
    worksWith: "Works with",
    learning: "learning",
    learnings: "learnings",
    moreFrom: "More from",
    carries: "Carries",
    ...labels,
  };
  return (
    <>
      <header className="mt-8 flex flex-col items-center gap-8 text-center md:flex-row md:gap-8 md:text-left">
        <AgentTile agent={agent} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col items-center md:items-start">
          <h1 className="text-balance font-semibold text-[32px] tracking-tight">
            {agent.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {creator}
            <span className="text-[14px] text-ink-muted">
              {agent.installsCount > 0
                ? `${agent.installsCount.toLocaleString()} ${text.installs}`
                : text.newAgent}
            </span>
          </div>
        </div>
        {actions}
      </header>
      <div className="mt-16 flex flex-col gap-16">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:gap-12">
          <Section title={text.bio}>{bio}</Section>
          {skills ? (
            <Section title={`${text.skills} · ${agent.skills?.length ?? 0}`}>
              {skills}
            </Section>
          ) : null}
        </div>
        {integrations ? (
          <Section title={text.worksWith}>{integrations}</Section>
        ) : null}
        {learnings ? (
          <p className="text-sm text-ink-muted">
            {text.carries} {learnings.toLocaleString()}{" "}
            {learnings === 1 ? text.learning : text.learnings}
          </p>
        ) : null}
        {moreAgents ? (
          <Section title={`${text.moreFrom} ${agent.creator.displayName}`}>
            {moreAgents}
          </Section>
        ) : null}
        {footer}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-6 font-semibold text-[20px] tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
