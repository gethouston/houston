import type { StepChrome } from "@houston-ai/chat";
import { Button } from "@houston-ai/core";
import { Check, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../stores/ui";
import {
  ChatConnectStepShell,
  type StepDraftApi,
} from "./chat-connect-step-shell";
import {
  ApiKeyNameField,
  ApiKeyReveal,
  useApiKeyCreateFlow,
} from "./settings/sections/api-key-create-flow";

interface Props extends StepChrome, StepDraftApi {
  stepId: string;
  reason?: string;
  name: string;
  keyName: string;
  ready: boolean;
  onFinished: (name: string) => void;
  onSkip: (name: string, message?: string) => void;
}

export function ChatHandsOnApiKeyCard({
  stepId,
  reason,
  name,
  keyName,
  ready,
  onFinished,
  onSkip,
  ...chrome
}: Props) {
  const { t } = useTranslation(["chat", "settings"]);
  const flow = useApiKeyCreateFlow(keyName);
  const formId = `api-key-form-${stepId}`;
  const revealed = flow.revealed;
  const finish = () => {
    flow.clear();
    onFinished(name);
  };

  return (
    <ChatConnectStepShell
      {...chrome}
      busy={flow.pending}
      cta={
        <>
          <Button
            className="gap-1.5"
            disabled={flow.pending}
            onClick={finish}
            size="sm"
            type="button"
            variant={revealed ? "default" : "outline"}
          >
            <Check className="size-3.5" />
            {t("chat:interaction.handsOnDone")}
          </Button>
          {!revealed && (
            <Button
              disabled={!ready || !flow.canSubmit}
              form={formId}
              size="sm"
              type="submit"
            >
              {t("settings:apiKeys.create.submit")}
            </Button>
          )}
        </>
      }
      done={false}
      icon={<KeyRound className="size-5 shrink-0 text-ink" />}
      locked={revealed !== null}
      onDecline={(message) => {
        flow.clear();
        onSkip(name, message);
      }}
      reason={reason ?? t("chat:interaction.apiKeyReason")}
      stepId={stepId}
      title={t("chat:interaction.apiKeyTitle")}
    >
      <p className="text-ink-muted text-sm">
        {t("chat:interaction.apiKeySafety")}
      </p>
      {revealed ? (
        <ApiKeyReveal created={revealed} />
      ) : !ready ? (
        <p className="text-ink-muted text-sm">
          {t("settings:apiKeys.idRow.loading")}
        </p>
      ) : (
        <>
          <form
            id={formId}
            onSubmit={(e) => {
              e.preventDefault();
              void flow.submit();
            }}
          >
            <ApiKeyNameField flow={flow} />
          </form>
          <Button
            className="self-start px-0"
            onClick={() => useUIStore.getState().openSettings("apiKeys")}
            size="sm"
            type="button"
            variant="link"
          >
            {t("chat:interaction.apiKeyManage")}
          </Button>
        </>
      )}
    </ChatConnectStepShell>
  );
}
