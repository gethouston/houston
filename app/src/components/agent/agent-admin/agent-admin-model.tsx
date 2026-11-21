import { Spinner } from "@houston-ai/core";
import {
  useAgentSettings,
  useSetAgentAllowedModels,
} from "../../../hooks/queries/use-agent-settings";
import { useCapabilities } from "../../../hooks/use-capabilities";
import { useHubCatalog } from "../../../lib/ai-hub/use-hub-catalog";
import type { AgentSectionProps } from "../../agent-settings/agent-settings-nav.ts";
import { AgentModelsSection } from "./agent-models-section.tsx";

export function AgentAdminModel({
  agent,
  labelledBy,
}: AgentSectionProps & { labelledBy?: string }) {
  const { capabilities } = useCapabilities();
  const teams = capabilities?.teams === true;
  const settingsQuery = useAgentSettings(agent.id, teams);
  const save = useSetAgentAllowedModels(agent.id);
  const { catalog } = useHubCatalog();
  const settings = settingsQuery.data;

  return (
    <div className="w-full">
      {settings && catalog ? (
        <AgentModelsSection
          key={agent.id}
          allowedModels={settings.allowedModels}
          models={catalog.models}
          saving={save.isPending}
          labelledBy={labelledBy}
          showIntro={labelledBy === undefined}
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
