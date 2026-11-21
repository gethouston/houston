import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useAssistant } from "../../hooks/use-assistant";
import { AssistantChat } from "./assistant-chat";
import { AssistantFailureState } from "./assistant-failure-state";
import { ManagerOnboarding } from "./onboarding/manager-onboarding";
import { useManagerOnboarding } from "./onboarding/manager-onboarding-context";

export function AssistantView() {
  const onboarding = useManagerOnboarding();
  if (onboarding) return <ManagerOnboarding state={onboarding} />;
  return <RealAssistantView />;
}

function RealAssistantView() {
  const { t } = useTranslation("assistant");
  const { handle, isLoading, failure, retry } = useAssistant();

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-ink-muted">
        <Spinner className="size-5" aria-label={t("opening")} />
        <p className="text-sm">{t("opening")}</p>
      </div>
    );
  }
  if (failure) return <AssistantFailureState onRetry={retry} />;
  if (!handle) return null;
  return <AssistantChat handle={handle} />;
}
