import "./styles/globals.css";
import { useRef } from "react";
import { useWorkspaceBootReads } from "./app-workspace";
import { SignInScreen } from "./components/auth/sign-in-screen";
import { StorageUnavailableScreen } from "./components/auth/storage-unavailable-screen";
import { AppRoutes } from "./components/shell/app-routes";
import { WorkspaceLoading } from "./components/shell/workspace-loading";
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
import { useNotificationNudges } from "./hooks/use-notification-nudges";
import { usePerfSpans } from "./hooks/use-perf-spans";
import { useProviderCatalog } from "./hooks/use-provider-catalog";
import { useReadCursorTracker } from "./hooks/use-read-cursors";
import { useScreenPrefetch } from "./hooks/use-screen-prefetch";
import { SessionUnavailableError, useSession } from "./hooks/use-session";
import { useSessionEvents } from "./hooks/use-session-events";
import { useSpacesLiveRefresh } from "./hooks/use-spaces-live-refresh";
import { useTeamMoveResume } from "./hooks/use-team-move-resume";
import { isIdentityConfigured } from "./lib/identity";
import { logger } from "./lib/logger";
import { useNavHistorySync } from "./lib/nav-history";

// Render-time first-run route logging, deduped at module scope so it needs no
// hook (it must run below App's conditional early returns).
let lastFirstRunRouteLine = "";
function logFirstRunRoute(line: string): void {
  if (line === lastFirstRunRouteLine) return;
  lastFirstRunRouteLine = line;
  logger.info(line);
}

export default function App() {
  useHoustonInit();
  useSessionEvents();
  // HOU-945: ping on @mentions, and remember which missions have been read so
  // the sidebar can show what is new for THIS person. Both ride the query cache
  // passively (no observers, no fetches) — see their module docs.
  useMentionNotifications();
  useReadCursorTracker();
  useNotificationNudges();
  useAgentInvalidation();
  // A team the user was just added to appears in the switcher without a
  // relaunch (quiet focus + interval re-list; spaces-capable hosts only).
  useSpacesLiveRefresh();
  useAnalyticsSubscriber();
  // `first_message_sent`, once per account, heard off the send analytics.
  useFirstMessageTracker();
  // Client UX timing spans (HOU-1011): upgrades T0 to the shell's process
  // start and ships measured journeys to the gateway metrics ingest.
  usePerfSpans();
  useIntegrationSessionSync();
  // Fetch the host's pi-ai catalog once and hydrate the PROVIDERS cache app-wide,
  // so every provider/model surface renders the real runnable set from load.
  useProviderCatalog();
  useScreenPrefetch();
  // Mirror the ui store's nav stack into browser history (back/forward walk
  // the app). The one history writer besides the deep-link param strip above,
  // which preserves `history.state` — the two cannot fight.
  useNavHistorySync();

  // NOTE: install identity, `install_created`, `session_started`, and theme
  // load run in <StartupEffects> at the top of the tree (main.tsx), NOT here.
  // They MUST fire before the language/disclaimer gates' `onboarding_*` events,
  // and those gates block <App/> from mounting on a fresh install — so this
  // effect would run too late and break the sequential onboarding funnel.

  useAppDocumentListeners();

  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useSession();

  // The SDK owns reconnect, renewal and identity fencing for desktop models.
  useLocalBridgeAutoReconnect(session?.uid ?? null);

  // Re-drive any share-via-team agent move whose driver vanished mid-move
  // (HOU-817): the gateway keeps the agent locked until the move finishes.
  // Gated on a signed-in session — every move call is authenticated.
  useMoveResume(Boolean(session));
  useTeamMoveResume(Boolean(session));

  useIdentityTagging(session);

  const routing = useFirstRunRouting();
  useWorkspaceBootReads();

  // First-boot latch (HOU-907). The workspace-boot splash below is a FIRST-BOOT
  // affordance only: once the full gate has cleared once for this App mount, a
  // space switch must never re-blank the shell. A switch flips capabilities +
  // both onboarding flags to loading (the space-cache reset) and re-runs
  // loadAgents — but the chrome is zustand-backed and every pane is
  // skeleton-capable + capabilities-undefined-safe, so it tolerates the
  // transition in place. Reset is natural, not manual: on sign-out / account
  // change the HOU-903 identity reset drops the session, so <HostedEngineGate>
  // (which wraps <App/> in main.tsx) swaps to the sign-in screen and UNMOUNTS
  // this subtree — the next identity remounts App with the latch back at false,
  // so a genuinely fresh identity still gets its first-boot splash.
  const bootedRef = useRef(false);

  // Auth gate: identity configured + session not yet resolved → splash.
  // Already resolved to null → sign-in screen. `null` session on a transient
  // blip is unlikely because the desktop session reads locally (Keychain), and
  // the web SDK holds `isLoading` until it resolves persistence.
  if (isIdentityConfigured() && sessionLoading) {
    return <WorkspaceLoading />;
  }
  // Secure-storage read fault (retries exhausted): the device's store couldn't
  // be read, which is NOT a signed-out user. Show a retryable storage-error
  // screen, never SignInScreen — a spurious sign-in here reads as a logout.
  if (
    isIdentityConfigured() &&
    sessionError instanceof SessionUnavailableError
  ) {
    return <StorageUnavailableScreen onRetry={() => void refetchSession()} />;
  }
  if (isIdentityConfigured() && !session) {
    // Local account login. Dev builds sign in with the passwordless email code
    // (the `houston://` OAuth callback opens the installed prod app, so Google
    // sign-in is prod-only there).
    return <SignInScreen />;
  }

  // First boot only: block on the splash until every gate input has settled
  // once. After that, a space switch re-flips these (see `bootedRef`) but the
  // shell stays mounted and its panes skeleton in place instead of unmounting.
  if (!bootedRef.current && routing.bootGateActive) {
    return <WorkspaceLoading />;
  }
  bootedRef.current = true;

  // Hook-free (module-level dedupe): this sits below the loading/auth early
  // returns, where a useEffect would violate the Rules of Hooks, and it must
  // log only routes the settled gate inputs produce.
  logFirstRunRoute(routing.routeLogLine);

  return (
    <AppRoutes
      route={routing.route}
      survey={routing.survey}
      showSurveyPrompt={routing.showSurveyPrompt}
      migrationReconnect={routing.migrationReconnect}
      onFirstRunSurveyDone={routing.onFirstRunSurveyDone}
      onCompletionPromptClosed={routing.onCompletionPromptClosed}
    />
  );
}
