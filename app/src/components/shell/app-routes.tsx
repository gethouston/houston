import type { Toast } from "@houston-ai/core";
import { AppWorkspace } from "../../app-workspace";
import type { MigrationReconnectState } from "../../hooks/use-migration-reconnect";
import type { OnboardingSurveyState } from "../../hooks/use-onboarding-survey";
import type { OnboardingRoute } from "../../lib/onboarding-route";
import { useUIStore } from "../../stores/ui";
import { ManagerOnboardingHost } from "../assistant/onboarding/manager-onboarding-host";
import { CloudMigrationGate } from "../onboarding/cloud-migration/cloud-migration-gate";
import { MigrationReconnectScreen } from "../onboarding/migration-reconnect-screen";
import { ClaudeBrowserLogin } from "./claude-browser-login";
import { ProviderLoginFallback } from "./provider-login-fallback";

export function AppRoutes({
  route,
  survey,
  showSurveyPrompt,
  migrationReconnect,
  onFirstRunSurveyDone,
  onCompletionPromptClosed,
}: {
  route: OnboardingRoute;
  survey: OnboardingSurveyState;
  showSurveyPrompt: boolean;
  migrationReconnect: MigrationReconnectState;
  onFirstRunSurveyDone: () => void;
  onCompletionPromptClosed: () => void;
}) {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);
  const mappedToasts: Toast[] = toasts.map((t) => {
    const base = t.description ? `${t.title} ${t.description}` : t.title;
    return {
      id: t.id,
      message: t.count && t.count > 1 ? `${base} (×${t.count})` : base,
      variant: t.variant ?? "info",
      action: t.action,
    };
  });

  return (
    <CloudMigrationGate>
      <ManagerOnboardingHost
        route={route}
        survey={survey}
        showSurveyPrompt={showSurveyPrompt}
        onFirstRunSurveyDone={onFirstRunSurveyDone}
        onCompletionPromptClosed={onCompletionPromptClosed}
      >
        {route === "app" && migrationReconnect.show ? (
          <>
            <ProviderLoginFallback />
            <ClaudeBrowserLogin />
            <MigrationReconnectScreen onDone={migrationReconnect.dismiss} />
          </>
        ) : (
          <AppWorkspace toasts={mappedToasts} onDismissToast={dismissToast} />
        )}
      </ManagerOnboardingHost>
    </CloudMigrationGate>
  );
}
