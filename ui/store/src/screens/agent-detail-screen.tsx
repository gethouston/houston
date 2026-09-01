import type { ReactNode } from "react";
import type { AgentCardLabels } from "../components/agent-card";
import { AgentDetailLayout } from "../components/agent-detail-layout";
import { AgentGrid } from "../components/grids";
import { IntegrationMark } from "../components/integration-mark";
import { resolveIntegrationLabels } from "../integrations";
import type {
  StoreAgentRow,
  StoreLinkComponent,
  StoreSkillRow,
} from "../types";
import { StoreScreenError, StoreScreenLoading } from "./screen-state";

const defaults = {
  newAgent: "New",
  installs: "installs",
  bio: "Bio",
  skills: "Skills",
  worksWith: "Works with",
  learning: "learning",
  learnings: "learnings",
  moreFrom: "More from",
  carries: "Carries",
  loadFailed: "This agent could not be loaded.",
  retry: "Try again",
};

export function AgentDetailScreen({
  agent,
  skills,
  creator,
  actions,
  renderBio,
  renderSkills,
  moreAgents = [],
  agentHref,
  LinkComponent,
  footer,
  agentCardLabels,
  labels: provided,
  loading,
  failed,
  onRetry,
}: {
  agent: StoreAgentRow;
  skills: StoreSkillRow[];
  creator: ReactNode;
  actions?: ReactNode;
  renderBio: (description: string, tagline?: string | null) => ReactNode;
  renderSkills?: (skills: StoreSkillRow[]) => ReactNode;
  moreAgents?: StoreAgentRow[];
  agentHref: (agent: StoreAgentRow) => string;
  LinkComponent?: StoreLinkComponent;
  footer?: ReactNode;
  agentCardLabels?: Partial<AgentCardLabels>;
  labels?: Partial<typeof defaults>;
  loading?: boolean;
  failed?: boolean;
  onRetry?: () => void;
}) {
  const labels = { ...defaults, ...provided };
  if (loading) return <StoreScreenLoading />;
  if (failed) {
    return (
      <StoreScreenError
        message={labels.loadFailed}
        retryLabel={labels.retry}
        onRetry={onRetry}
      />
    );
  }
  const integrations = resolveIntegrationLabels(agent.integrations);
  return (
    <AgentDetailLayout
      agent={{ ...agent, skills }}
      creator={creator}
      actions={actions}
      bio={renderBio(agent.description, agent.tagline)}
      skills={skills.length && renderSkills ? renderSkills(skills) : undefined}
      integrations={
        integrations.length ? (
          <ul className="flex flex-wrap gap-x-8 gap-y-4">
            {integrations.map(({ slug, label }) => (
              <li key={slug} className="flex items-center gap-2.5">
                <IntegrationMark slug={slug} label={label} className="size-5" />
                <span className="text-[15px] text-ink-muted">{label}</span>
              </li>
            ))}
          </ul>
        ) : undefined
      }
      learnings={agent.learningsCount}
      moreAgents={
        moreAgents.length ? (
          <AgentGrid
            agents={moreAgents}
            agentHref={agentHref}
            LinkComponent={LinkComponent}
            labels={agentCardLabels}
          />
        ) : undefined
      }
      footer={footer}
      labels={labels}
    />
  );
}
