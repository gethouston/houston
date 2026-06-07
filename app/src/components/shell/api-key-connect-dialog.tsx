import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, DialogDescription, DialogTitle, Spinner } from "@houston-ai/core";
import type { ProviderInfo } from "../../lib/providers";
import { isApiKeyOnlyProvider } from "../../lib/provider-api-key";
import { ApiKeyForm } from "./api-key-form";
import { OpenRouterConnectBody, type OpenRouterConnectStep } from "./openrouter-connect-body";
import { ConnectDialogShell } from "./connect-dialog-layout";
import {
  syncOpenRouterEditorActions,
  type OpenRouterModelsEditorActions,
} from "../../lib/openrouter-models-editor-sync";

interface Props {
  provider: ProviderInfo | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (providerId: string) => void;
}

export function ApiKeyConnectDialog({ provider, onOpenChange, onSaved }: Props) {
  const { t } = useTranslation("providers");
  const [orStep, setOrStep] = useState<OpenRouterConnectStep>("key");
  const [modelActions, setModelActions] = useState<OpenRouterModelsEditorActions | null>(null);

  useEffect(() => {
    if (!provider) {
      setOrStep("key");
      setModelActions(null);
    }
  }, [provider]);

  if (!provider || !isApiKeyOnlyProvider(provider)) return null;

  const isOpenRouter = provider.id === "openrouter";
  const onModelsStep = isOpenRouter && orStep === "models";

  const descriptionKey = isOpenRouter
    ? onModelsStep
      ? "openrouterConnect.modelsDescription"
      : "openrouterConnect.description"
    : "apiKeyConnect.description";

  const titleKey = onModelsStep ? "openrouterConnect.modelsTitle" : "apiKeyConnect.title";

  const handleModelActionsReady = useCallback((actions: OpenRouterModelsEditorActions | null) => {
    setModelActions((prev) => syncOpenRouterEditorActions(prev, actions));
  }, []);

  const handleOpenRouterSaved = useCallback(() => {
    onSaved(provider.id);
    onOpenChange(false);
  }, [onOpenChange, onSaved, provider.id]);

  return (
    <Dialog
      open={provider !== null}
      onOpenChange={(open) => {
        if (!open) {
          setOrStep("key");
          setModelActions(null);
          onOpenChange(false);
        }
      }}
    >
      <ConnectDialogShell
        header={
          <>
            <DialogTitle>
              {onModelsStep
                ? t("openrouterConnect.modelsTitle")
                : t(titleKey, { name: provider.name })}
            </DialogTitle>
            <DialogDescription>{t(descriptionKey, { name: provider.name })}</DialogDescription>
          </>
        }
        footer={
          onModelsStep ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOrStep("key");
                  setModelActions(null);
                }}
              >
                {t("openrouterConnect.back")}
              </Button>
              <Button
                type="button"
                disabled={!modelActions?.canFinish || modelActions.saving}
                onClick={() => void modelActions?.onFinish()}
                className="gap-1.5"
              >
                {modelActions?.saving ? <Spinner className="size-3.5" /> : null}
                {modelActions?.saving
                  ? t("openrouterConnect.savingModels")
                  : t("openrouterConnect.finish")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("apiKeyConnect.cancel")}
            </Button>
          )
        }
      >
        {isOpenRouter ? (
          <OpenRouterConnectBody
            providerName={provider.name}
            apiKeyConsoleUrl={provider.apiKeyConsoleUrl ?? ""}
            step={orStep}
            onStepChange={setOrStep}
            onModelActionsReady={handleModelActionsReady}
            onSaved={handleOpenRouterSaved}
          />
        ) : (
          <ApiKeyForm
            providerName={provider.name}
            providerId={provider.id}
            apiKeyConsoleUrl={provider.apiKeyConsoleUrl ?? ""}
            onSaved={handleOpenRouterSaved}
          />
        )}
      </ConnectDialogShell>
    </Dialog>
  );
}
