import { Spinner } from "@houston-ai/core";
import {
  useAgentSettings,
  useSetAgentAllowedModels,
} from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useHubCatalog } from "../../../lib/ai-hub/use-hub-catalog";
import type { AgentAdminScreenProps } from "./agent-admin-nav.ts";
import { AgentModelsSection } from "./agent-models-section.tsx";

/**
 * "Allowed models" section (Access group, multiplayer only): the manager's
 * allowed-models ceiling, i.e. which models members may run this agent on
 * ({@link AgentModelsSection}, written via `setAgentSettings.allowedModels`).
 * Each member then picks their own model from the allowed set in the composer.
 * Rendered flush in the right pane (no card wrapper).
 *
 * The model directory is the shared AI-hub catalog ({@link useHubCatalog}) so
 * this editor and the AI Models hub never drift. The catalog is local (built
 * from the host's `/v1/catalog`), so it only ever loads, never errors here; the
 * catalog query's sole owner surfaces any load failure as a toast (we never
 * re-observe it, to avoid a double toast). The editor renders only once BOTH
 * the settings (Teams-gated) and the catalog are present; while either loads a
 * quiet spinner shows.
 *
 * The Access group is multiplayer-only, so single-player never reaches here:
 * single-player has no ceiling and its sole user sets the model in the composer.
 *
 * `readOnly` (a non-manager viewing the agent's Permissions tab) disables every
 * control and hides the "Add models" list via the shared editor's own mode, so a
 * member sees the model ceiling without a dead affordance. The gateway is the
 * real enforcer.
 */
export function AgentAdminModel({
  agent,
  readOnly = false,
}: AgentAdminScreenProps & { readOnly?: boolean }) {
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;
  const settingsQuery = useAgentSettings(agent.id, teams);
  const save = useSetAgentAllowedModels(agent.id);
  const { catalog } = useHubCatalog();
  const settings = settingsQuery.data;

  // Width belongs to the mounting surface (the Permissions panel's page
  // column); this body must never re-center itself inside it.
  return (
    <div className="w-full">
      {settings && catalog ? (
        // Keyed by agent so the editor's view-only search + lab filters never
        // leak across agents — Agent Settings stays mounted on agent switch.
        <AgentModelsSection
          key={agent.id}
          allowedModels={settings.allowedModels}
          models={catalog.models}
          saving={save.isPending}
          readOnly={readOnly}
          onSave={(next) => save.mutate(next)}
        />
      ) : (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" />
        </div>
      )}
    </div>
  );
}
