import "./styles/globals.css";
import type { Toast } from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { tauriSystem } from "./lib/tauri";
import { useHoustonInit } from "./hooks/use-houston-init";
import { useSessionEvents } from "./hooks/use-session-events";
import { useAgentInvalidation } from "./hooks/use-agent-invalidation";
import { useAnalyticsSubscriber } from "./hooks/use-analytics-subscriber";
import { useWorkspaceStore } from "./stores/workspaces";
import { useAgentStore } from "./stores/agents";
import { useUIStore } from "./stores/ui";
import { useConnections, useComposioApps } from "./hooks/queries";
import { analytics } from "./lib/analytics";
import { setUser as setSentryUser, clearUser as clearSentryUser } from "./lib/sentry";
import { loadTheme } from "./lib/theme";
import { isAuthConfigured } from "./lib/supabase";
import { installDeepLinkListener } from "./lib/auth";
import { useSession } from "./hooks/use-session";
import { SignInScreen } from "./components/auth/sign-in-screen";
import { PersonalAssistantOnboarding } from "./components/onboarding/personal-assistant-onboarding";
import { WorkspaceShell } from "./components/shell/workspace-shell";
import { shouldAllowNativeContextMenu } from "./lib/context-menu";

export default function App() {
  useHoustonInit();
  useSessionEvents();
  useAgentInvalidation();
  useAnalyticsSubscriber();
  // Prefetch Composio data on launch so the integrations tab opens instantly.
  useConnections();
  useComposioApps();

  // Track active installs once per day. This is the canonical DAU/WAU/MAU
  // signal; launch counts are intentionally not captured.
  useEffect(() => {
    analytics.init().then(({ isNew }) => {
      analytics.trackActive();
      if (isNew) analytics.track("install_created");
    });
    loadTheme();
  }, []);

  // Supabase auth (PR 2): listen for Google OAuth deep-link callbacks.
  // No-op when auth isn't configured (SUPABASE_URL empty in local dev).
  useEffect(() => {
    if (!isAuthConfigured()) return;
    return installDeepLinkListener();
  }, []);

  const { data: session, isLoading: sessionLoading } = useSession();

  // Identify / alias the user in PostHog AND Sentry on sign-in; reset on
  // sign-out. Runs AFTER analytics.init() has claimed the install_id as
  // distinct_id, so `alias(userId, profile)` correctly merges prior
  // anonymous history. Sentry gets the same identity so crashes are
  // attributable to a user when triaging.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const userId = session?.user?.id ?? null;
    const userEmail = session?.user?.email ?? null;
    if (userId && userId !== prevUserIdRef.current) {
      analytics.alias(userId, { email: userEmail });
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
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
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
        <p className="text-muted-foreground text-sm">{t("engineGate.starting")}</p>
      </div>
    );
  }
  if (isAuthConfigured() && !session) {
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

  if (agentLoading || wsLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background text-foreground">
        <p className="text-muted-foreground text-sm">{t("engineGate.starting")}</p>
      </div>
    );
  }

  if (workspaces.length === 0) {
    return (
      <PersonalAssistantOnboarding
        toasts={mappedToasts}
        onDismissToast={dismissToast}
      />
    );
  }

  return (
    <WorkspaceShell
      toasts={mappedToasts}
      onDismissToast={dismissToast}
    />
  );
}
