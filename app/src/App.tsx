import "./styles/globals.css";
import type { Toast } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SignInScreen } from "./components/auth/sign-in-screen";
import { MigrationReconnectScreen } from "./components/onboarding/migration-reconnect-screen";
import { PersonalAssistantOnboarding } from "./components/onboarding/personal-assistant-onboarding";
import { WorkspaceShell } from "./components/shell/workspace-shell";
import { useAgentInvalidation } from "./hooks/use-agent-invalidation";
import { useAnalyticsSubscriber } from "./hooks/use-analytics-subscriber";
import { useCanCreateAgents } from "./hooks/use-can-create-agents";
import { useHoustonInit } from "./hooks/use-houston-init";
import { useIntegrationSessionSync } from "./hooks/use-integration-session-sync";
import { useMigrationReconnect } from "./hooks/use-migration-reconnect";
import { useSession } from "./hooks/use-session";
import { useSessionEvents } from "./hooks/use-session-events";
import { analytics } from "./lib/analytics";
import { installDeepLinkListener } from "./lib/auth";
import { shouldAllowNativeContextMenu } from "./lib/context-menu";
import {
  clearUser as clearSentryUser,
  setUser as setSentryUser,
} from "./lib/sentry";
import { isAuthConfigured } from "./lib/supabase";
import { tauriSystem } from "./lib/tauri";
import { useAgentStore } from "./stores/agents";
import { useUIStore } from "./stores/ui";
import { useWorkspaceStore } from "./stores/workspaces";

export default function App() {
  useHoustonInit();
  useSessionEvents();
  useAgentInvalidation();
  useAnalyticsSubscriber();
  useIntegrationSessionSync();

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

  // Supabase auth (PR 2): listen for Google OAuth deep-link callbacks.
  // No-op when auth isn't configured (SUPABASE_URL empty in local dev).
  useEffect(() => {
    if (!isAuthConfigured()) return;
    return installDeepLinkListener();
  }, []);

  const { data: session, isLoading: sessionLoading } = useSession();

  // Tag the user in PostHog AND Sentry on sign-in; reset on sign-out. The
  // install_id stays PostHog's distinct_id (the website UTM bridge + onboarding
  // funnel depend on it); `identifyUser` aliases the Supabase id onto that person
  // (merging the same human across devices/reinstalls) AND attaches
  // supabase_user_id / email / signup date as person properties, so every
  // authenticated person is both one PostHog person and joinable to a Supabase
  // account. Sentry gets the same identity so crashes are attributable to a user
  // when triaging.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    const userEmail = session?.user?.email ?? null;
    const signupDate = session?.user?.created_at?.slice(0, 10) ?? null;
    if (userId && userId !== prevUserIdRef.current) {
      analytics.identifyUser(userId, { email: userEmail, signupDate });
      setSentryUser({ id: userId, email: userEmail });
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

  const { t } = useTranslation("shell");
  const wsLoading = useWorkspaceStore((s) => s.loading);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agentLoading = useAgentStore((s) => s.loading);
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

  const mappedToasts: Toast[] = toasts.map((t) => ({
    id: t.id,
    message: t.description ? `${t.title} ${t.description}` : t.title,
    variant: t.variant ?? "info",
    action: t.action,
  }));

  // Auth gate: Supabase configured + session not yet resolved → splash.
  // Already resolved to null → sign-in screen. `null` session on a
  // transient Supabase blip (access token still valid in Keychain)
  // is unlikely because getSession() reads locally, not remotely.
  if (isAuthConfigured() && sessionLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground text-sm">
          {t("engineGate.starting")}
        </p>
      </div>
    );
  }
  if (isAuthConfigured() && !session) {
    // Local account login. Keep the dev-only paste-the-code fallback (#146) — a
    // dev build's `houston://` callback opens the installed prod app, so without
    // it dev sign-in strands. Production standalone gets no paste box (HOU-621).
    return <SignInScreen allowManualCallback={import.meta.env.DEV} />;
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

  if (agentLoading || wsLoading || capabilitiesLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground text-sm">
          {t("engineGate.starting")}
        </p>
      </div>
    );
  }

  if (workspaces.length === 0 && canCreateAgents && !capabilitiesError) {
    return (
      <PersonalAssistantOnboarding
        toasts={mappedToasts}
        onDismissToast={dismissToast}
      />
    );
  }

  // Migrated user with workspaces but no connected provider: welcome them back
  // and walk them through reconnecting once, before the shell (which is unusable
  // without a provider anyway). Falls through the instant a provider connects or
  // the user dismisses — see useMigrationReconnect for the full trigger.
  if (migrationReconnect.show) {
    return <MigrationReconnectScreen onDone={migrationReconnect.dismiss} />;
  }

  return <WorkspaceShell toasts={mappedToasts} onDismissToast={dismissToast} />;
}
