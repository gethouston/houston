import "./styles/globals.css";
import type { Toast } from "@houston-ai/core";
import { useEffect, useRef, useState } from "react";
import { SignInScreen } from "./components/auth/sign-in-screen";
import { StorageUnavailableScreen } from "./components/auth/storage-unavailable-screen";
import { CloudMigrationGate } from "./components/onboarding/cloud-migration/cloud-migration-gate";
import { ArmInAppOnboarding } from "./components/onboarding/in-app-onboarding";
import { MigrationReconnectScreen } from "./components/onboarding/migration-reconnect-screen";
import {
  isFirstRun,
  onboardingRoute,
} from "./components/onboarding/missions/onboarding-flow";
import { OnboardingSurveyScreen } from "./components/onboarding/survey-screen";
import { ClaudeBrowserLogin } from "./components/shell/claude-browser-login";
import { DisclaimerGate } from "./components/shell/disclaimer-gate";
import { ProviderLoginFallback } from "./components/shell/provider-login-fallback";
import { WorkspaceLoading } from "./components/shell/workspace-loading";
import { WorkspaceShell } from "./components/shell/workspace-shell";
import { useAgentInvalidation } from "./hooks/use-agent-invalidation";
import { useAnalyticsSubscriber } from "./hooks/use-analytics-subscriber";
import { useCanCreateAgents } from "./hooks/use-can-create-agents";
import { useHoustonInit } from "./hooks/use-houston-init";
import { useIntegrationSessionSync } from "./hooks/use-integration-session-sync";
import { useLocalBridgeAutoReconnect } from "./hooks/use-local-bridge-autoreconnect";
import { useMentionNotifications } from "./hooks/use-mention-notifications";
import { useMigrationReconnect } from "./hooks/use-migration-reconnect";
import { useMoveResume } from "./hooks/use-move-resume";
import { useNotificationNudges } from "./hooks/use-notification-nudges";
import { useOnboardingCompleted } from "./hooks/use-onboarding-completed";
import { useOnboardingPending } from "./hooks/use-onboarding-pending";
import { useOnboardingSurvey } from "./hooks/use-onboarding-survey";
import { usePerfSpans } from "./hooks/use-perf-spans";
import { useProviderCatalog } from "./hooks/use-provider-catalog";
import { useReadCursorTracker } from "./hooks/use-read-cursors";
import { useScreenPrefetch } from "./hooks/use-screen-prefetch";
import { SessionUnavailableError, useSession } from "./hooks/use-session";
import { useSessionEvents } from "./hooks/use-session-events";
import { useSpacesLiveRefresh } from "./hooks/use-spaces-live-refresh";
import { analytics } from "./lib/analytics";
import { shouldAllowNativeContextMenu } from "./lib/context-menu";
import { newEngineActive } from "./lib/engine";
import { isIdentityConfigured } from "./lib/identity";
import { logger } from "./lib/logger";
import {
  clearUser as clearSentryUser,
  setUser as setSentryUser,
} from "./lib/sentry";
import { useStoreGatewaySession } from "./lib/store-gateway-session";
import { useStoreInstallDeepLink } from "./lib/store-install-deeplink";
import { tauriSystem } from "./lib/tauri";
import { useAgentStore } from "./stores/agents";
import { useUIStore } from "./stores/ui";
import { useWorkspaceStore } from "./stores/workspaces";

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
  // Client UX timing spans (HOU-1011): upgrades T0 to the shell's process
  // start and ships measured journeys to the gateway metrics ingest.
  usePerfSpans();
  useIntegrationSessionSync();
  // Keep the Agent Store adapter pointed at the gateway with the user's session
  // token in local-sidecar mode (account-based publish; no manage tokens).
  useStoreGatewaySession();
  // Fetch the host's pi-ai catalog once and hydrate the PROVIDERS cache app-wide,
  // so every provider/model surface renders the real runnable set from load.
  useProviderCatalog();
  useScreenPrefetch();
  // Turn an `houston://store/install` deep link (desktop) or `?install=<slug>`
  // web param into a seeded import wizard once the shell is live.
  useStoreInstallDeepLink();

  // NOTE: install identity, `install_created`, `session_started`, and theme
  // load run in <StartupEffects> at the top of the tree (main.tsx), NOT here.
  // They MUST fire before the language/disclaimer gates' `onboarding_*` events,
  // and those gates block <App/> from mounting on a fresh install — so this
  // effect would run too late and break the sequential onboarding funnel.

  // Session-end signal: fired when the window goes hidden (cmd-tab away,
  // minimize, close). Tauri's WKWebView delivers `pagehide` reliably on
  // app close; `visibilitychange` covers the in-app cases. Used for
  // computing session-duration distribution and pairs with `session_started`.
  useEffect(() => {
    let firedThisVisibility = false;
    const onHide = () => {
      if (firedThisVisibility) return;
      firedThisVisibility = true;
      analytics.track("session_ended");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        onHide();
      } else {
        firedThisVisibility = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useSession();

  // Desktop boot: if this machine owns a local-model tunnel whose cloud endpoint
  // is still active, quietly re-establish frpc (dead after a restart). Gated on a
  // signed-in session — the reconnect mints hosted tunnel credentials.
  useLocalBridgeAutoReconnect(Boolean(session));

  // Re-drive any share-via-team agent move whose driver vanished mid-move
  // (HOU-817): the gateway keeps the agent locked until the move finishes.
  // Gated on a signed-in session — every move call is authenticated.
  useMoveResume(Boolean(session));

  // Tag the user in PostHog AND Sentry on sign-in; reset on sign-out. The
  // install_id stays PostHog's distinct_id (the website UTM bridge + onboarding
  // funnel depend on it); `identifyUser` aliases the Firebase uid onto that person
  // (merging the same human across devices/reinstalls) AND attaches
  // firebase_uid / email as person properties, so every authenticated person is
  // both one PostHog person and joinable to a Firebase account. Sentry gets the
  // same identity so crashes are attributable to a user when triaging. The
  // identity Session carries no created_at, so signupDate is null.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.uid ?? null;
    const userEmail = session?.email ?? null;
    const signupDate = null;
    if (userId && userId !== prevUserIdRef.current) {
      analytics.identifyUser(userId, {
        email: userEmail,
        name: session?.displayName ?? null,
        signupDate,
      });
      setSentryUser({
        id: userId,
        email: userEmail,
        name: session?.displayName ?? null,
      });
      prevUserIdRef.current = userId;
    } else if (!userId && prevUserIdRef.current) {
      analytics.reset();
      clearSentryUser();
      prevUserIdRef.current = null;
    }
  }, [session]);

  // Safety net for any anchor nobody else handles: send it to the system
  // browser instead of letting the webview navigate away from the app.
  //
  // It must SKIP an event whose default was already prevented. `preventDefault`
  // does not stop the event bubbling up to this document-level listener, so a
  // component that already opened the URL itself (chat's `Autolink`, which
  // routes through the same `openUrl`) would otherwise have it opened a SECOND
  // time — two browser tabs for one click (PRODUCT-1231). `defaultPrevented`
  // is precisely the signal "somebody already dealt with this".
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("javascript:"))
        return;
      e.preventDefault();
      tauriSystem.openUrl(href);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // Suppress the native WebView context menu (Reload / Back / Forward) in
  // production builds — it's a developer affordance that shouldn't be exposed
  // to end users. Left enabled in dev so Inspect Element still works.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const handler = (e: MouseEvent) => {
      if (shouldAllowNativeContextMenu(e.target)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  // `loaded` (a load attempt has settled at least once), NOT `loading`: the
  // splash below must cover only the INITIAL load. Reading raw `loading` made
  // every later `loadWorkspaces()` — the Settings retry, a create-team refresh
  // — swap the whole app for the full-screen splash and remount the shell.
  const wsLoaded = useWorkspaceStore((s) => s.loaded);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agentLoading = useAgentStore((s) => s.loading);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
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
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);
  // A plain org `user` can't create agents (the create-your-assistant
  // onboarding would 403 at `POST /agents`), so they skip that funnel and land
  // straight in the shell on their assigned agents (or an empty state without a
  // create CTA). Owner/admin and every single-player build keep the flow.
  // The routing below must never run on UNLOADED capabilities: `canCreate` is
  // optimistically true while they load, which would push a multiplayer `user`
  // with zero workspaces into an onboarding whose POST /agents 403s. So the
  // loading state joins the splash gate, and a persistent fetch failure
  // (multiplayer status unknown) fails closed into the normal shell path.
  const {
    canCreate: canCreateAgents,
    isLoading: capabilitiesLoading,
    isError: capabilitiesError,
  } = useCanCreateAgents();

  // One-time "reconnect your AI" moment for users upgrading from the legacy
  // desktop build: their agents + history migrated, but their AI sign-in did
  // not. Shows only when (migrated AND no provider connected AND not yet
  // dismissed) — never on a fresh install, never once a provider is connected.
  const migrationReconnect = useMigrationReconnect();

  // The onboarding survey (job, industry, automation goal). Read on every boot,
  // not just first runs: it also drives the in-app prompt that re-opens the
  // survey for anyone who answered the job question before the other two
  // existed. Latches below hold each mounting on screen across the async gap
  // between the last save and the hook's flags catching up.
  const survey = useOnboardingSurvey();
  const [firstRunSurveyDone, setFirstRunSurveyDone] = useState(false);
  const [completionPromptClosed, setCompletionPromptClosed] = useState(false);

  // Interrupted-onboarding resume: a durable flag set while first-run is
  // mid-flight and cleared on finish/skip. Because the assistant is created
  // silently at AI-connect, `isFirstRun` (agent count) stops firing after that
  // point, so this flag is what re-enters onboarding for a user who quit
  // mid-flow. Read it before the first-run gate; join its load to the splash so
  // a returning, fully-onboarded user never flashes into onboarding.
  const { isPending: onboardingPending, isLoading: onboardingPendingLoading } =
    useOnboardingPending();

  // Durable "already onboarded" flag (HOU-732). `isFirstRun` reads a zero-agent
  // workspace, which can't tell a fresh install from an emptied one — deleting
  // every agent, or finishing the migration wizard with zero cloud agents,
  // would wrongly re-enter onboarding. This flag is what distinguishes them:
  // set on every onboarding terminal path and on a "done" migration, and
  // backfilled here for existing active users. Its load joins the splash gate so
  // a returning agent-less user never flashes into onboarding during boot.
  const {
    isCompleted: onboardingCompleted,
    isLoading: onboardingCompletedLoading,
    markCompleted,
  } = useOnboardingCompleted();

  // Backfill: any existing user who already has agents predates the flag, so
  // stamp them completed once on boot. This upgrades-only (never clears), so a
  // fresh install with zero agents stays uncompleted and onboarding is
  // unchanged. Gated on the fetch having settled so we don't write redundantly.
  useEffect(() => {
    if (
      agents.length > 0 &&
      !onboardingCompletedLoading &&
      !onboardingCompleted
    ) {
      void markCompleted();
    }
  }, [
    agents.length,
    onboardingCompletedLoading,
    onboardingCompleted,
    markCompleted,
  ]);

  const mappedToasts: Toast[] = toasts.map((t) => {
    const base = t.description ? `${t.title} ${t.description}` : t.title;
    return {
      id: t.id,
      // Coalesced repeats (store addToast) surface their tally, so a retried
      // failure still visibly reacts instead of silently refreshing.
      message: t.count && t.count > 1 ? `${base} (×${t.count})` : base,
      variant: t.variant ?? "info",
      action: t.action,
    };
  });

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

  // Everything below the auth gates renders behind the agreement gate: the
  // setup order is language (main.tsx) → sign-in (above) → agreement → survey.
  // The gate self-skips once accepted, and entirely on cloud web (HOU-1014).

  // On the v3 control plane the first-run gate below reads the AGENT count, so
  // the splash must also cover boot's async gap between workspaces resolving
  // and the first `loadAgents` call — `agents: []` in that gap is "not loaded
  // yet", not "fresh install" (an existing user must never flash into
  // onboarding, which arms the setup overlay and marks `onboarding_pending`
  // so it would come back on the next boot too). The v3
  // adapter always reports one synthetic workspace, so `loadAgents` is
  // guaranteed to run and settle `loaded`. The legacy Rust wire gates on
  // workspaces alone and skips this wait (zero-workspace first runs never load
  // agents, so `loaded` would hang false there).
  const bootGateActive =
    agentLoading ||
    !wsLoaded ||
    capabilitiesLoading ||
    onboardingPendingLoading ||
    onboardingCompletedLoading ||
    (newEngineActive() && !agentsLoaded);
  // First boot only: block on the splash until every gate input has settled
  // once. After that, a space switch re-flips these (see `bootedRef`) but the
  // shell stays mounted and its panes skeleton in place instead of unmounting.
  if (!bootedRef.current && bootGateActive) {
    return <WorkspaceLoading />;
  }
  bootedRef.current = true;

  // First-run signal differs by wire (HOU-653): the legacy Rust engine uses
  // zero WORKSPACES, but the v3 control plane has no workspace CRUD — the
  // adapter always reports one synthetic workspace — so there first-run is
  // zero AGENTS. Both counts are settled here (the splash above waited on
  // wsLoaded + agentLoading).
  const firstRun = isFirstRun({
    controlPlane: newEngineActive(),
    workspaceCount: workspaces.length,
    agentCount: agents.length,
  });

  // The cloud-migration gate (HOU-719) wraps everything below the auth gates:
  // on the hosted desktop build it offers to move this machine's OLD local
  // data into the user's cloud agents. It must sit ABOVE the firstRun branch —
  // a migrating user has zero cloud agents and would otherwise be captured by
  // the create-your-assistant onboarding. It renders its children untouched
  // whenever the trigger says no (non-hosted builds, web, no legacy data,
  // already done/declined).
  //
  // The login fallback rides alongside the shell so a sign-in launched from a
  // surface without its own login handler (the in-chat reconnect card) still
  // opens the browser / dialog. It rides the same branch as the setup overlay,
  // which guides the user through the shell's own AI Hub. The
  // migration-reconnect branch
  // is the CO-LOCATED upgrade moment (workspaces migrated in place, no
  // provider connected) — see useMigrationReconnect for its trigger.

  // The first-run gate (HOU-732), decided by a pure function so its four
  // behaviors are unit-tested: fresh install shows the survey then the
  // create-your-assistant flow; an interrupted flow resumes via
  // `onboarding_pending`; a completed user (migration done, or an emptied
  // workspace) lands in the shell. The survey is answered once and persisted in
  // engine prefs — `surveyAnswered` folds its load + saved answers so a
  // first-run user still splashes while it resolves, and the local latch keeps
  // the screen up across the gap between its last save and the refreshed flags.
  const surveyAnswered =
    firstRunSurveyDone ||
    (!survey.loading &&
      survey.segmentAnswered &&
      survey.industryAnswered &&
      survey.goalAnswered);
  const firstRunRoute = onboardingRoute({
    firstRun,
    onboardingPending,
    onboardingCompleted,
    canCreateAgents,
    capabilitiesError,
    surveyAnswered,
  });

  // Anyone who answered the job question before industry + goal existed gets
  // the survey re-opened once, in front of the shell, until they finish it or
  // say "Not now" (which is remembered in the preference, never re-asked).
  const showSurveyPrompt =
    firstRunRoute === "app" &&
    !survey.loading &&
    survey.needsCompletionPrompt &&
    !completionPromptClosed;

  // The route inputs, in the frontend log: "why did this boot land where it
  // did" is unanswerable after the fact without them (a mis-routed first run
  // looks identical to a returning user once the shell is up). Hook-free
  // (module-level dedupe) — this sits below the loading/auth early returns,
  // where a useEffect would violate the Rules of Hooks.
  logFirstRunRoute(
    `[first-run] route=${firstRunRoute} firstRun=${firstRun} agents=${agents.length} ` +
      `completed=${onboardingCompleted} pending=${onboardingPending} ` +
      `canCreate=${canCreateAgents} capErr=${capabilitiesError} surveyAnswered=${surveyAnswered} ` +
      `surveyPrompt=${showSurveyPrompt}`,
  );

  return (
    <DisclaimerGate>
      <CloudMigrationGate>
        {firstRunRoute === "segment" ? (
          survey.loading ? (
            <WorkspaceLoading />
          ) : (
            // The three questions are mandatory: the first-run survey renders
            // no skip affordance (profile_completion keeps its "Not now").
            <OnboardingSurveyScreen
              mode="first_run"
              survey={survey}
              onComplete={() => setFirstRunSurveyDone(true)}
            />
          )
        ) : firstRunRoute === "app" && migrationReconnect.show ? (
          <>
            <ProviderLoginFallback />
            <ClaudeBrowserLogin />
            <MigrationReconnectScreen onDone={migrationReconnect.dismiss} />
          </>
        ) : showSurveyPrompt ? (
          <OnboardingSurveyScreen
            mode="profile_completion"
            survey={survey}
            onComplete={() => setCompletionPromptClosed(true)}
            onDismiss={() => {
              void survey.dismissCompletionPrompt();
              setCompletionPromptClosed(true);
            }}
          />
        ) : (
          // Route "app" AND the first-run "onboarding" route: the setup runs IN
          // the app, as the in-app onboarding overlay armed over the shell.
          // ONE branch for both
          // on purpose — connecting the AI provisions the assistant mid-flow,
          // which flips `firstRun` and would otherwise remount the shell (and
          // reset the overlay) at that instant. The arm rides AFTER the shell
          // so the element positions match across the flip.
          <>
            <ProviderLoginFallback />
            <ClaudeBrowserLogin />
            <WorkspaceShell
              toasts={mappedToasts}
              onDismissToast={dismissToast}
            />
            {firstRunRoute === "onboarding" && <ArmInAppOnboarding />}
          </>
        )}
      </CloudMigrationGate>
    </DisclaimerGate>
  );
}
