import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../../hooks/queries";
import {
  useAgentSettings,
  useSetAgentSettings,
} from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { INTEGRATION_PROVIDER } from "../../integrations";
import { AgentAllowlistSection } from "../agent-integrations/agent-allowlist-section";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";

/**
 * "Allowed integrations" drill-in (Access card): the relocated agent-manager
 * allowlist editor, now owned here rather than on the Integrations tab. Wired
 * with the agent settings ceiling + org ceiling, the catalog, and the caller's
 * connections. Feature-detected on the `teams` capability; a host without it
 * shows a graceful note.
 */
export function AgentAdminIntegrations({
  agent,
  onBack,
}: AgentAdminScreenProps) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, teams);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, teams);
  const settingsQuery = useAgentSettings(agent.id, teams);
  const settingsMutation = useSetAgentSettings(agent.id);
  const settings = settingsQuery.data;

  return (
    <AgentAdminScreenShell onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {settings ? (
          <AgentAllowlistSection
            allowedToolkits={settings.allowedToolkits}
            orgAllowedToolkits={settings.orgAllowedToolkits}
            catalog={catalog.data ?? []}
            connectedToolkits={(connections.data ?? []).map((c) => c.toolkit)}
            saving={settingsMutation.isPending}
            onSave={(next) => settingsMutation.mutate(next)}
          />
        ) : settingsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" />
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("agentAdmin.integrations.unavailable")}
          </p>
        )}
      </div>
    </AgentAdminScreenShell>
  );
}
