import { Spinner } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { FirstRunConversation } from "./first-run-conversation";
import type { ManagerOnboardingState } from "./manager-onboarding-context";
import { ProfileConversation } from "./profile-conversation";

export function ManagerOnboarding({
  state,
}: {
  state: ManagerOnboardingState;
}) {
  const { t } = useTranslation("assistant");
  if (state.survey.loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 text-ink-muted">
        <Spinner className="size-5" aria-label={t("opening")} />
        <p className="text-sm">{t("opening")}</p>
      </div>
    );
  }
  if (state.mode === "first_run") return <FirstRunConversation state={state} />;
  return <ProfileConversation state={state} />;
}
