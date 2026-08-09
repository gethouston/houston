import type { ReactNode } from "react";
import { AgentAdminInstructions } from "../agent/agent-admin/agent-admin-instructions";
import { AgentAdminIntegrations } from "../agent/agent-admin/agent-admin-integrations";
import { AgentAdminKnowledge } from "../agent/agent-admin/agent-admin-knowledge";
import { AgentAdminModel } from "../agent/agent-admin/agent-admin-model";
import { AgentAdminSkills } from "../agent/agent-admin/agent-admin-skills";
import type {
  AgentSectionProps,
  AgentSettingsSection,
} from "./agent-settings-nav.ts";
import { AgentSettingsPeople } from "./agent-settings-people.tsx";

/**
 * The access bodies (people, apps, models) are deliberately flush (`w-full`) so
 * the mounting surface owns their width. This gives them the SAME column the
 * self-padded bodies (job description, learnings) bring — `max-w-3xl px-6` on
 * one `pt-2` top rhythm — so nothing shifts as the rail switches sections.
 */
function AccessColumn({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-12">{children}</div>
  );
}

/**
 * The ONE section switch: renders the section the rail selected into the right
 * pane. Every branch COMPOSES the existing section component rather than
 * re-implementing it, so no two surfaces can drift.
 */
export function AgentSettingsSectionView({
  agent,
  section,
  readOnly = false,
}: AgentSectionProps & { section: AgentSettingsSection }) {
  switch (section) {
    case "job-description":
      return <AgentAdminInstructions agent={agent} readOnly={readOnly} />;
    case "learnings":
      return <AgentAdminKnowledge agent={agent} readOnly={readOnly} />;
    case "people":
      return (
        <AccessColumn>
          <AgentSettingsPeople agent={agent} readOnly={readOnly} />
        </AccessColumn>
      );
    case "integrations":
      return (
        <AccessColumn>
          <AgentAdminIntegrations agent={agent} readOnly={readOnly} />
        </AccessColumn>
      );
    case "models":
      return (
        <AccessColumn>
          <AgentAdminModel agent={agent} readOnly={readOnly} />
        </AccessColumn>
      );
    case "skills":
      return <AgentAdminSkills agent={agent} readOnly={readOnly} />;
  }
}
