import { useState } from "react";
import { connectedProviderId } from "../components/onboarding/connect-ai-card-state";
import { newEngineActive } from "../lib/engine";
import { isFirstRun, onboardingRoute } from "../lib/onboarding-route";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCanCreateAgents } from "./use-can-create-agents";
import { useMigrationReconnect } from "./use-migration-reconnect";
import { useOnboardingFlags } from "./use-onboarding-flags";
import { useOnboardingSurvey } from "./use-onboarding-survey";
import { useProviderStatuses } from "./use-provider-statuses";

/**
 * Every boot / first-run routing input App gates on, and the route they
 * resolve to. The derived values are pure; App reads the route only once the
 * boot splash (`bootGateActive`) has cleared, when every input is settled.
 */
export function useFirstRunRouting() {
  // `loaded` (a load attempt has settled at least once), NOT `loading`: the
  // boot splash must cover only the INITIAL load. Reading raw `loading` made
  // every later `loadWorkspaces()` — the Settings retry, a create-team refresh
  // — swap the whole app for the full-screen splash and remount the shell.
  const wsLoaded = useWorkspaceStore((s) => s.loaded);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const agentLoading = useAgentStore((s) => s.loading);
  const agents = useAgentStore((s) => s.agents);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  // A plain org `user` can't create agents (first-run
  // onboarding would 403 at `POST /agents`), so they skip that funnel and land
  // straight in the shell on their assigned agents (or an empty state without a
  // create CTA). Owner/admin and every single-player build keep the flow.
  // The routing must never run on UNLOADED capabilities: `canCreate` is
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

  const {
    pendingStage,
    onboardingPendingLoading,
    onboardingCompleted,
    onboardingCompletedLoading,
  } = useOnboardingFlags(agents.length);

  // The connect-AI step reads the ONE shared provider derivation (HOU-979):
  // a scan still loading, or one whose re-probe failed, confirms nothing.
  const aiConnected = connectedProviderId(useProviderStatuses()) !== null;

  // On the v3 control plane the first-run gate reads the AGENT count, so the
  // splash must also cover boot's async gap between workspaces resolving and
  // the first `loadAgents` call — `agents: []` in that gap is "not loaded
  // yet", not "fresh install" (an existing user must never flash into
  // onboarding, which marks `onboarding_pending` so it would come back on the
  // next boot too). The v3
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

  // First-run signal differs by wire (HOU-653): the legacy Rust engine uses
  // zero WORKSPACES, but the v3 control plane has no workspace CRUD — the
  // adapter always reports one synthetic workspace — so there first-run is
  // zero AGENTS. Both counts are settled once the splash clears (it waits on
  // wsLoaded + agentLoading).
  const firstRun = isFirstRun({
    controlPlane: newEngineActive(),
    workspaceCount: workspaces.length,
    agentCount: agents.length,
  });

  // The first-run gate (HOU-732), decided by a pure function so its behaviors
  // are unit-tested: onboarding in progress walks the survey, the connect-AI
  // card and the team card, resuming via `onboarding_pending` (and holding the
  // team card once reached, whatever the provider does); a completed user
  // (migration done, or an emptied workspace) lands in the shell. The survey is
  // answered once and persisted in engine prefs; the local latch keeps its
  // screen up across the gap between its last save and the refreshed flags.
  const surveyAnswered =
    firstRunSurveyDone ||
    (!survey.loading &&
      survey.segmentAnswered &&
      survey.industryAnswered &&
      survey.goalAnswered);
  const route = onboardingRoute({
    firstRun,
    pendingStage,
    onboardingCompleted,
    canCreateAgents,
    capabilitiesError,
    surveyAnswered,
    aiConnected,
  });

  // Anyone who answered the job question before industry + goal existed gets
  // the survey re-opened once, in front of the shell, until they finish it or
  // say "Not now" (which is remembered in the preference, never re-asked).
  const showSurveyPrompt =
    route === "app" &&
    !survey.loading &&
    survey.needsCompletionPrompt &&
    !completionPromptClosed;

  // The route inputs, for the frontend log: "why did this boot land where it
  // did" is unanswerable after the fact without them (a mis-routed first run
  // looks identical to a returning user once the shell is up).
  const routeLogLine =
    `[first-run] route=${route} firstRun=${firstRun} agents=${agents.length} ` +
    `completed=${onboardingCompleted} pending=${pendingStage} ` +
    `canCreate=${canCreateAgents} capErr=${capabilitiesError} surveyAnswered=${surveyAnswered} ` +
    `aiConnected=${aiConnected} ` +
    `surveyPrompt=${showSurveyPrompt}`;

  return {
    bootGateActive,
    route,
    showSurveyPrompt,
    survey,
    migrationReconnect,
    onFirstRunSurveyDone: () => setFirstRunSurveyDone(true),
    onCompletionPromptClosed: () => setCompletionPromptClosed(true),
    routeLogLine,
  };
}
