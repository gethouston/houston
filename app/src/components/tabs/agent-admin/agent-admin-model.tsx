import { useTranslation } from "react-i18next";
import { useAgentConfig } from "../../../hooks/queries";
import {
  getDefaultModel,
  normalizeLegacyModel,
  validEffortOrDefault,
  validModelOrNull,
  validProviderOrNull,
} from "../../../lib/providers.ts";
import { ChatEffortSelector } from "../../chat-effort-selector";
import { ChatModelSelector } from "../../chat-model-selector";
import {
  type AgentAdminScreenProps,
  AgentAdminScreenShell,
} from "./agent-admin-back-bar";
import { useSaveAgentModel } from "./use-save-agent-model.ts";

/**
 * AI-model drill-in: a manager pins the provider / model / reasoning effort this
 * agent runs, persisted via {@link useSaveAgentModel} to the same config file
 * the composer picker writes. Reuses the composer's own selectors. Reflects the
 * current pin, falling back to the platform default when unset. Only managers /
 * the single-player sole user reach it, so the selectors never lock here.
 */
export function AgentAdminModel({ agent, onBack }: AgentAdminScreenProps) {
  const { t } = useTranslation("teams");
  const path = agent.folderPath;
  const { data: config } = useAgentConfig(path);
  const save = useSaveAgentModel(path);

  const provider = validProviderOrNull(config?.provider ?? null) ?? "anthropic";
  const model =
    validModelOrNull(provider, normalizeLegacyModel(config?.model ?? null)) ??
    getDefaultModel(provider);
  const effort = validEffortOrDefault(provider, model, config?.effort ?? null);

  return (
    <AgentAdminScreenShell onBack={onBack}>
      <div className="mx-auto w-full max-w-xl px-8 py-10 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            {t("agentAdmin.model.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("agentAdmin.model.helper")}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <ChatModelSelector
            provider={provider}
            model={model}
            onSelect={(p, m) => save.mutate({ provider: p, model: m })}
          />
          <ChatEffortSelector
            provider={provider}
            model={model}
            effort={effort}
            onSelect={(e) => save.mutate({ effort: e })}
          />
        </div>
      </div>
    </AgentAdminScreenShell>
  );
}
