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
 * (`agent-detail.tsx`, always editable behind its manager gate) AND the agent
 * workspace's own **Permissions** tab, where it is visible to EVERYONE who can
 * open the agent — `readOnly` when the viewer can't manage it — so a user always
 * sees why their agent can or can't use something.
 *
 * `readOnly` threads to every section: People rows become static labels (and a
 * plain member's empty roster degrades to an honest viewer line), and both the
 * Integrations and AI Models editors drop to their own read-only mode (controls
 * disabled, the "Add" list hidden). No hover gating anywhere. The gateway is the
 * sole enforcer; these gates only avoid showing a control the viewer can't act on.
 */
export function AgentPermissionsPanel({
  agent,
  members,
  initialTab = "people",
  readOnly,
}: {
  agent: Agent;
  members: OrgMember[];
  /** Tab to open on first mount (a deep link may land on Integrations). */
  initialTab?: PermissionsAgentTab;
  /** View-only: the viewer can't manage this agent. */
  readOnly: boolean;
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
        <AgentPeopleTab agent={agent} members={members} readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="integrations">
        <AgentAdminIntegrations agent={agent} readOnly={readOnly} />
      </TabsContent>
      <TabsContent value="models">
        <AgentAdminModel agent={agent} readOnly={readOnly} />
      </TabsContent>
    </Tabs>
  );
}
