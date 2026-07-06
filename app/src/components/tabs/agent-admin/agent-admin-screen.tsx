import { AgentAccessSection } from "../agent-access-section";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";
import { AgentAdminInstructions } from "./agent-admin-instructions";
import { AgentAdminIntegrations } from "./agent-admin-integrations";
import { AgentAdminKnowledge } from "./agent-admin-knowledge";
import { AgentAdminModel } from "./agent-admin-model";
import type { AgentAdminScreen } from "./agent-admin-nav.ts";
import { AgentAdminSkills } from "./agent-admin-skills";

/**
 * Renders the drill-in screen for a landing selection. Heavy editors live in
 * their own files; the self-contained people-with-access section wraps directly
 * in the shared shell. Name / color / delete are inline on the landing (see
 * `agent-admin-details`), not a screen.
 */
export function AgentAdminScreenView({
  agent,
  screen,
  onBack,
}: AgentAdminScreenProps & { screen: AgentAdminScreen }) {
  switch (screen) {
    case "instructions":
      return <AgentAdminInstructions agent={agent} onBack={onBack} />;
    case "skills":
      return <AgentAdminSkills agent={agent} onBack={onBack} />;
    case "knowledge":
      return <AgentAdminKnowledge agent={agent} onBack={onBack} />;
    case "model":
      return <AgentAdminModel agent={agent} onBack={onBack} />;
    case "integrations":
      return <AgentAdminIntegrations agent={agent} onBack={onBack} />;
    case "people":
      return (
        <AgentAdminScreenShell onBack={onBack}>
          <div className="mx-auto w-full max-w-xl px-8 py-10">
            <AgentAccessSection agent={agent} />
          </div>
        </AgentAdminScreenShell>
      );
  }
}
