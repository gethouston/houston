import { Spinner } from "@houston-ai/core";
import { useMemo } from "react";
import {
  useAgentSettings,
  useSetAgentAllowedModels,
} from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";
import { modelCatalog } from "./agent-admin-models-catalog.ts";
import { AgentModelsSection } from "./agent-models-section.tsx";

/**
 * "Allowed models" drill-in (Access card, multiplayer only): the manager's
 * allowed-models ceiling, i.e. which models members may run this agent on
 * ({@link AgentModelsSection}, written via `setAgentSettings.allowedModels`).
 * Each member then picks their own model from the allowed set in the composer.
 * Rendered flush in the Integrations-tab page container (no card wrapper).
 *
 * The Access card is multiplayer-only, so single-player never reaches here:
 * single-player has no ceiling and its sole user sets the model in the composer.
 * Only managers / owners reach this tab, so nothing locks here; the gateway is
 * the real enforcer.
 */
export function AgentAdminModel({ agent, onBack }: AgentAdminScreenProps) {
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;
  const settingsQuery = useAgentSettings(agent.id, teams);
  const save = useSetAgentAllowedModels(agent.id);
  const catalog = useMemo(() => modelCatalog(), []);
  const settings = settingsQuery.data;

  return (
    <AgentAdminScreenShell onBack={onBack}>
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {settings ? (
          <AgentModelsSection
            allowedModels={settings.allowedModels}
            catalog={catalog}
            saving={save.isPending}
            onSave={(next) => save.mutate(next)}
          />
        ) : (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" />
          </div>
        )}
      </div>
    </AgentAdminScreenShell>
  );
}
