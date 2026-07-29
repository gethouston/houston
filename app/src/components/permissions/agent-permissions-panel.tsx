import { Tabs, TabsContent, TabsList, TabsTrigger } from "@houston-ai/core";
import type { OrgMember } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import type { Agent } from "../../lib/types";
import { AgentAdminIntegrations } from "../tabs/agent-admin/agent-admin-integrations";
import { AgentAdminModel } from "../tabs/agent-admin/agent-admin-model";
import { AgentPeopleTab } from "./agent-people-tab";
import type { PermissionsAgentTab } from "./permissions-nav-store";

/**
 * The three-tab permissions body for ONE agent — **People** (who can use it, at
 * what level), **Integrations** (its app ceiling), and **AI Models** (its model
 * ceiling). Shared by two fronts, one target: the top-level Permissions drill-in
 * (`agent-detail.tsx`, always editable behind its manager gate). The agent
 * workspace's Settings screen reuses the individual sections for its read-only
 * access rows; this panel is only the editable top-level drill-in.
 */
export function AgentPermissionsPanel({
  agent,
  members,
  initialTab = "people",
}: {
  agent: Agent;
  members: OrgMember[];
  /** Tab to open on first mount (a deep link may land on Integrations). */
  initialTab?: PermissionsAgentTab;
}) {
  const { t } = useTranslation("teams");

  return (
    <Tabs defaultValue={initialTab}>
      <TabsList variant="line" className="mb-6">
        <TabsTrigger value="people">
          {t("permissions.agentTabs.people")}
        </TabsTrigger>
        <TabsTrigger value="integrations">
          {t("permissions.agentTabs.integrations")}
        </TabsTrigger>
        <TabsTrigger value="models">
          {t("permissions.agentTabs.models")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="people">
        <AgentPeopleTab agent={agent} members={members} readOnly={false} />
      </TabsContent>
      <TabsContent value="integrations">
        <AgentAdminIntegrations agent={agent} readOnly={false} />
      </TabsContent>
      <TabsContent value="models">
        <AgentAdminModel agent={agent} readOnly={false} />
      </TabsContent>
    </Tabs>
  );
}
