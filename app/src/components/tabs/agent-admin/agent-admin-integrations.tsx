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
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";

/**
 * "Allowed integrations" section (Access group): the relocated agent-manager
 * allowlist editor, now owned here rather than on the Integrations tab. Wired
 * with the agent settings ceiling + org ceiling, the catalog, and the caller's
 * connections. Feature-detected on the `teams` capability; a host without it
 * shows a graceful note.
 *
 * `readOnly` (a non-manager viewing the agent's Permissions tab) disables every
 * control and hides the "Add apps" catalog via the shared editor's own mode, so
 * a member sees the app ceiling without a dead affordance.
 */
export function AgentAdminIntegrations({
  agent,
  readOnly = false,
}: AgentAdminScreenProps & { readOnly?: boolean }) {
  const { t } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;

  const connections = useIntegrationConnections(INTEGRATION_PROVIDER, teams);
  const catalog = useIntegrationToolkits(INTEGRATION_PROVIDER, teams);
  const settingsQuery = useAgentSettings(agent.id, teams);
  const settingsMutation = useSetAgentSettings(agent.id);
  const settings = settingsQuery.data;

  // Width belongs to the mounting surface (the Permissions panel's page
  // column); this body must never re-center itself inside it.
  return (
    <div className="w-full">
      {settings ? (
        // Keyed by agent so the editor's view-only category filter never leaks
        // across agents — Agent Settings stays mounted on agent switch.
        <AgentAllowlistSection
          key={agent.id}
          allowedToolkits={settings.allowedToolkits}
          catalog={catalog.data ?? []}
          connectedToolkits={(connections.data ?? []).map((c) => c.toolkit)}
          saving={settingsMutation.isPending}
          readOnly={readOnly}
          onSave={(next) => settingsMutation.mutate(next)}
        />
      ) : settingsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-ink-muted">
          {t("agentAdmin.integrations.unavailable")}
        </p>
      )}
    </div>
  );
}
