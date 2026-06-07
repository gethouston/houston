import { useTranslation } from "react-i18next";
import { HoustonEngineError } from "@houston-ai/engine-client";
import { ApiKeyForm } from "./api-key-form";
import { OpenRouterModelsStep, type OpenRouterModelsEditorActions } from "./openrouter-models-step";
import { verifyOpenRouterApiKey } from "../../lib/openrouter-catalog-api";
import { useSeedOpenRouterCatalogCache } from "../../hooks/use-openrouter-catalog";

export type OpenRouterConnectStep = "key" | "models";

interface Props {
  providerName: string;
  apiKeyConsoleUrl: string;
  step: OpenRouterConnectStep;
  onStepChange: (step: OpenRouterConnectStep) => void;
  onModelActionsReady: (actions: OpenRouterModelsEditorActions | null) => void;
  onSaved: () => void;
}

export function OpenRouterConnectBody({
  providerName,
  apiKeyConsoleUrl,
  step,
  onStepChange,
  onModelActionsReady,
  onSaved,
}: Props) {
  const { t } = useTranslation("providers");
  const seedCatalog = useSeedOpenRouterCatalogCache();

  if (step === "models") {
    return (
      <OpenRouterModelsStep
        onBack={() => onStepChange("key")}
        onDone={onSaved}
        onActionsReady={onModelActionsReady}
      />
    );
  }

  return (
    <ApiKeyForm
      providerName={providerName}
      providerId="openrouter"
      apiKeyConsoleUrl={apiKeyConsoleUrl}
      afterKeySaved={async () => {
        const models = await verifyOpenRouterApiKey();
        seedCatalog(models);
      }}
      onSaved={() => onStepChange("models")}
      saveLabel={t("openrouterConnect.testAndContinue")}
      savingLabel={t("openrouterConnect.verifyingKey")}
      formatSaveError={(err) => {
        if (err instanceof HoustonEngineError && err.status === 404) {
          return {
            title: t("openrouterConnect.engineStale"),
            description: t("openrouterConnect.engineStaleDetail"),
          };
        }
        if (err instanceof HoustonEngineError && err.status === 400) {
          return {
            title: t("openrouterConnect.keyRejected"),
            description: err.message,
          };
        }
        return null;
      }}
    />
  );
}
