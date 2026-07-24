import "./styles/globals.css";
import type { Toast } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { SignInScreen } from "./components/auth/sign-in-screen";
import { StorageUnavailableScreen } from "./components/auth/storage-unavailable-screen";
import { CloudMigrationGate } from "./components/onboarding/cloud-migration/cloud-migration-gate";
import { MigrationReconnectScreen } from "./components/onboarding/migration-reconnect-screen";
import {
  isFirstRun,
  onboardingRoute,
} from "./components/onboarding/missions/onboarding-flow";
import { PersonalAssistantOnboarding } from "./components/onboarding/personal-assistant-onboarding";
import { OnboardingSegmentScreen } from "./components/onboarding/segment-screen";
import { ClaudeBrowserLogin } from "./components/shell/claude-browser-login";
import { ProviderLoginFallback } from "./components/shell/provider-login-fallback";
import { WorkspaceLoading } from "./components/shell/workspace-loading";
import { WorkspaceShell } from "./components/shell/workspace-shell";
import { useAgentInvalidation } from "./hooks/use-agent-invalidation";
import { useAnalyticsSubscriber } from "./hooks/use-analytics-subscriber";
import { useCanCreateAgents } from "./hooks/use-can-create-agents";
import { useHoustonInit } from "./hooks/use-houston-init";
import { useIntegrationSessionSync } from "./hooks/use-integration-session-sync";
import { useLocalBridgeAutoReconnect } from "./hooks/use-local-bridge-autoreconnect";
import { useMigrationReconnect } from "./hooks/use-migration-reconnect";
import { useMoveResume } from "./hooks/use-move-resume";
import { useNotificationNudges } from "./hooks/use-notification-nudges";
import { useOnboardingCompleted } from "./hooks/use-onboarding-completed";
import { useOnboardingPending } from "./hooks/use-onboarding-pending";
import { useOnboardingSegment } from "./hooks/use-onboarding-segment";
import { useProviderCatalog } from "./hooks/use-provider-catalog";
import { SessionUnavailableError, useSession } from "./hooks/use-session";
import { useSessionEvents } from "./hooks/use-session-events";
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
  const authConfigured = isIdentityConfigured();
  useHoustonInit();
  useSessionEvents();
  useNotificationNudges();
  useAgentInvalidation();
  useAnalyticsSubscriber();
  useIntegrationSessionSync();
  // Keep the Agent Store adapter pointed at the gateway with the user's session
  // token in local-sidecar mode (account-based publish; no manage tokens).
  useStoreGatewaySession();
  // Fetch the host's pi-ai catalog once and hydrate the PROVIDERS cache app-wide,
  // so every provider/model surface renders the real runnable set from load.
  useProviderCatalog();
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

  // Intercept all link clicks and open in system browser
  useEffect(() => {
    const handler = (e: MouseEvent) => {
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

  const wsLoading = useWorkspaceStore((s) => s.loading);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agentLoading = useAgentStore((s) => s.loading);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);
  const tutorialActive = useUIStore((s) => s.tutorialActive);
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
  const firstRunCandidate = isFirstRun({
    controlPlane: newEngineActive(),
    workspaceCount: workspaces.length,
    agentCount: agents.length,
  });
  const segmentGateEnabled =
    (!authConfigured || (!sessionLoading && Boolean(session))) &&
    !tutorialActive &&
    !agentLoading &&
    !wsLoading &&
    !capabilitiesLoading &&
    !(newEngineActive() && !agentsLoaded) &&
    firstRunCandidate &&
    canCreateAgents &&
    !capabilitiesError;
  const onboardingSegment = useOnboardingSegment(segmentGateEnabled);

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

  // First-run tutorial. Held in front of the shell while the orchestrator is
  // mid-flight, even after the workspace and agent have been created (M2+).
  // Checked BEFORE the loading splash on purpose: when M2 (Brain) creates the
  // workspace it triggers `loadWorkspaces()` which flips `wsLoading` to true.
  // If the splash rendered here it would unmount the orchestrator, fire its
  // cleanup, and clear `tutorialActive` — kicking the user out of the tutorial.
  if (tutorialActive) {
    return (
      <PersonalAssistantOnboarding
        toasts={mappedToasts}
        onDismissToast={dismissToast}
      />
    );
  }

  // On the v3 control plane the first-run gate below reads the AGENT count, so
  // the splash must also cover boot's async gap between workspaces resolving
  // and the first `loadAgents` call — `agents: []` in that gap is "not loaded
  // yet", not "fresh install" (an existing user must never flash into
  // onboarding, which would pin them there via `tutorialActive`). The v3
  // adapter always reports one synthetic workspace, so `loadAgents` is
  // guaranteed to run and settle `loaded`. The legacy Rust wire gates on
  // workspaces alone and skips this wait (zero-workspace first runs never load
  // agents, so `loaded` would hang false there).
  if (
    agentLoading ||
    wsLoading ||
    capabilitiesLoading ||
    onboardingPendingLoading ||
    onboardingCompletedLoading ||
    (newEngineActive() && !agentsLoaded)
  ) {
    return <WorkspaceLoading />;
  }

  // First-run signal differs by wire (HOU-653): the legacy Rust engine uses
  // zero WORKSPACES, but the v3 control plane has no workspace CRUD — the
  // adapter always reports one synthetic workspace — so there first-run is
  // zero AGENTS. Both counts are settled here (the splash above waited on
  // wsLoading + agentLoading).
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
  // opens the browser / dialog. Onboarding + tutorial mount their own handler
  // (the login mission), so they don't need it. The migration-reconnect branch
  // is the CO-LOCATED upgrade moment (workspaces migrated in place, no
  // provider connected) — see useMigrationReconnect for its trigger.

  // The first-run gate (HOU-732), decided by a pure function so its four
  // behaviors are unit-tested: fresh install shows segmentation then the
  // create-your-assistant flow; an interrupted flow resumes via
  // `onboarding_pending`; a completed user (migration done, or an emptied
  // workspace) lands in the shell. The segmentation question is answered once
  // and persisted in engine prefs — `segmentAnswered` folds its load + saved
  // value so a first-run user still splashes while it resolves.
  const segmentAnswered =
    !onboardingSegment.isLoading && Boolean(onboardingSegment.preference);
  const firstRunRoute = onboardingRoute({
    firstRun,
    onboardingPending,
    onboardingCompleted,
    canCreateAgents,
    capabilitiesError,
    segmentAnswered,
  });

  // The route inputs, in the frontend log: "why did this boot land where it
  // did" is unanswerable after the fact without them (a mis-routed first run
  // looks identical to a returning user once the shell is up). Hook-free
  // (module-level dedupe) — this sits below the loading/auth early returns,
  // where a useEffect would violate the Rules of Hooks.
  logFirstRunRoute(
    `[first-run] route=${firstRunRoute} firstRun=${firstRun} agents=${agents.length} ` +
      `completed=${onboardingCompleted} pending=${onboardingPending} ` +
      `canCreate=${canCreateAgents} capErr=${capabilitiesError} segmentAnswered=${segmentAnswered}`,
  );

  return (
    <CloudMigrationGate>
      {firstRunRoute === "segment" ? (
        onboardingSegment.isLoading ? (
          <WorkspaceLoading />
        ) : (
          <OnboardingSegmentScreen
            saving={onboardingSegment.isSaving}
            onContinue={async (segment) => {
              await onboardingSegment.saveSegment(segment);
            }}
          />
        )
      ) : firstRunRoute === "onboarding" ? (
        <PersonalAssistantOnboarding
          toasts={mappedToasts}
          onDismissToast={dismissToast}
        />
      ) : migrationReconnect.show ? (
        <>
          <ProviderLoginFallback />
          <ClaudeBrowserLogin />
          <MigrationReconnectScreen onDone={migrationReconnect.dismiss} />
        </>
      ) : (
        <>
          <ProviderLoginFallback />
          <ClaudeBrowserLogin />
          <WorkspaceShell toasts={mappedToasts} onDismissToast={dismissToast} />
        </>
      )}
    </CloudMigrationGate>
  );
}
