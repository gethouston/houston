import "./styles/globals.css";
import { useRef } from "react";
import { useWorkspaceBootReads } from "./app-workspace";
import { SignInScreen } from "./components/auth/sign-in-screen";
import { StorageUnavailableScreen } from "./components/auth/storage-unavailable-screen";
import { AppRoutes } from "./components/shell/app-routes";
import { WorkspaceLoading } from "./components/shell/workspace-loading";
import { UploadProgressProvider } from "./components/upload-progress-provider";
import { useAgentInvalidation } from "./hooks/use-agent-invalidation";
import { useAnalyticsSubscriber } from "./hooks/use-analytics-subscriber";
import { useAppDocumentListeners } from "./hooks/use-app-document-listeners";
import { useFirstMessageTracker } from "./hooks/use-first-message-tracker";
import { useFirstRunRouting } from "./hooks/use-first-run-routing";
import { useHoustonInit } from "./hooks/use-houston-init";
import { useIdentityTagging } from "./hooks/use-identity-tagging";
import { useIntegrationSessionSync } from "./hooks/use-integration-session-sync";
import { useLocalBridgeAutoReconnect } from "./hooks/use-local-bridge-autoreconnect";
import { useMentionNotifications } from "./hooks/use-mention-notifications";
import { useMoveResume } from "./hooks/use-move-resume";
import { useNativePush } from "./hooks/use-native-push";
import { useNotificationNudges } from "./hooks/use-notification-nudges";
import { usePerfSpans } from "./hooks/use-perf-spans";
import { useProviderCatalog } from "./hooks/use-provider-catalog";
import { usePushPresence } from "./hooks/use-push-presence";
import { useReadCursorTracker } from "./hooks/use-read-cursors";
import { useScreenPrefetch } from "./hooks/use-screen-prefetch";
import { SessionUnavailableError, useSession } from "./hooks/use-session";
import { useSessionEvents } from "./hooks/use-session-events";
import { useSpacesLiveRefresh } from "./hooks/use-spaces-live-refresh";
import { useTeamMoveResume } from "./hooks/use-team-move-resume";
import { useTimezoneSeed } from "./hooks/use-timezone-preference";
import { isIdentityConfigured } from "./lib/identity";
import { logger } from "./lib/logger";
import { useNavHistorySync } from "./lib/nav-history";

let lastFirstRunRouteLine = "";
function logFirstRunRoute(line: string): void {
  if (line === lastFirstRunRouteLine) return;
  lastFirstRunRouteLine = line;
  logger.info(line);
}

export default function App() {
  useHoustonInit();
  useSessionEvents();
  useMentionNotifications();
  useReadCursorTracker();
  useNotificationNudges();
  useAgentInvalidation();
  useSpacesLiveRefresh();
  useAnalyticsSubscriber();
  useFirstMessageTracker();
  usePerfSpans();
  useIntegrationSessionSync();
  useProviderCatalog();
  useScreenPrefetch();
  useNavHistorySync();

  useAppDocumentListeners();

  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useSession();
  usePushPresence(Boolean(session));
  useNativePush(Boolean(session));

  useLocalBridgeAutoReconnect(session?.uid ?? null);

  useMoveResume(Boolean(session));
  useTeamMoveResume(Boolean(session));

  useIdentityTagging(session);
  useTimezoneSeed();

  const routing = useFirstRunRouting();
  useWorkspaceBootReads();

  const bootedRef = useRef(false);

  if (isIdentityConfigured() && sessionLoading) {
    return <WorkspaceLoading />;
  }
  if (
    isIdentityConfigured() &&
    sessionError instanceof SessionUnavailableError
  ) {
    return <StorageUnavailableScreen onRetry={() => void refetchSession()} />;
  }
  if (isIdentityConfigured() && !session) {
    return <SignInScreen />;
  }

  if (!bootedRef.current && routing.bootGateActive) {
    return <WorkspaceLoading />;
  }
  bootedRef.current = true;

  logFirstRunRoute(routing.routeLogLine);

  return (
    <UploadProgressProvider>
      <AppRoutes
        route={routing.route}
        survey={routing.survey}
        showSurveyPrompt={routing.showSurveyPrompt}
        migrationReconnect={routing.migrationReconnect}
        onFirstRunSurveyDone={routing.onFirstRunSurveyDone}
        onCompletionPromptClosed={routing.onCompletionPromptClosed}
      />
    </UploadProgressProvider>
  );
}
