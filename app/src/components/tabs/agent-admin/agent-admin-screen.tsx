import { useOrg } from "../../../hooks/queries";
import { AgentPeopleTab } from "../../permissions/agent-people-tab";
import { AgentAdminInstructions } from "./agent-admin-instructions";
import { AgentAdminIntegrations } from "./agent-admin-integrations";
import { AgentAdminKnowledge } from "./agent-admin-knowledge";
import { AgentAdminModel } from "./agent-admin-model";
import type {
  AgentAdminScreen,
  AgentAdminScreenProps,
} from "./agent-admin-nav.ts";

/**
 * Renders the section selected in the settings rail into the right pane. Heavy
 * editors live in their own files. The access sections carry no padding of
 * their own (the Permissions drill-in mounts them inside its PageContainer),
 * so THIS surface owns their page column: people in a narrow centered column,
 * the apps/models editors in the same max-w-3xl column the configuration
 * sections use. Name / color / delete are not sections here — those actions
 * live on the sidebar agent row.
 */
export function AgentAdminScreenView({
  agent,
  screen,
  readOnly = false,
}: AgentAdminScreenProps & { screen: AgentAdminScreen; readOnly?: boolean }) {
  const { data: org } = useOrg(screen === "people");
  switch (screen) {
    case "instructions":
      return <AgentAdminInstructions agent={agent} readOnly={readOnly} />;
    case "knowledge":
      return <AgentAdminKnowledge agent={agent} readOnly={readOnly} />;
    case "people":
      return (
        <div className="mx-auto w-full max-w-xl px-8 py-10">
          <AgentPeopleTab
            agent={agent}
            members={org?.members ?? []}
            readOnly={readOnly}
          />
        </div>
      );
    case "integrations":
      return (
        <div className="mx-auto w-full max-w-3xl px-8 py-10">
          <AgentAdminIntegrations agent={agent} readOnly={readOnly} />
        </div>
      );
    case "model":
      return (
        <div className="mx-auto w-full max-w-3xl px-8 py-10">
          <AgentAdminModel agent={agent} readOnly={readOnly} />
        </div>
      );
  }
}
