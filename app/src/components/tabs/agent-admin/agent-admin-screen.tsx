import { AgentAccessSection } from "../agent-access-section";
import { AgentAdminConnect } from "./agent-admin-connect";
import { AgentAdminInstructions } from "./agent-admin-instructions";
import { AgentAdminKnowledge } from "./agent-admin-knowledge";
import type {
  AgentAdminScreen,
  AgentAdminScreenProps,
} from "./agent-admin-nav.ts";
import { AgentAdminSkills } from "./agent-admin-skills";

/**
 * Renders the section selected in the settings rail into the right pane. Heavy
 * editors live in their own files; the self-contained people-with-access section
 * renders in a plain centered column. Name / color / delete are not sections
 * here — those actions live on the sidebar agent row.
 */
export function AgentAdminScreenView({
  agent,
  screen,
}: AgentAdminScreenProps & { screen: AgentAdminScreen }) {
  switch (screen) {
    case "instructions":
      return <AgentAdminInstructions agent={agent} />;
    case "skills":
      return <AgentAdminSkills agent={agent} />;
    case "knowledge":
      return <AgentAdminKnowledge agent={agent} />;
    case "connect":
      return <AgentAdminConnect agent={agent} />;
    case "people":
      return (
        <div className="mx-auto w-full max-w-xl px-8 py-10">
          <AgentAccessSection agent={agent} />
        </div>
      );
  }
}
